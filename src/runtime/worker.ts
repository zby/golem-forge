/**
 * Worker Execution Runtime
 *
 * Executes workers with tool support and approval checking.
 * Manages the LLM conversation loop with tool calls.
 */

import {
  Context,
  lemmy,
  type ChatClient,
  type ToolResult,
  type AskInput,
  type Attachment,
} from "@mariozechner/lemmy";
import type { WorkerDefinition } from "../worker/schema.js";
import {
  ApprovalController,
  ApprovalResult,
  type ApprovalCallback,
  type ApprovalMode,
  type SecurityContext as ApprovalSecurityContext,
  supportsApprovalDescription,
} from "../approval/index.js";
import {
  ApprovedExecutor,
  type ApprovalToolset,
  type ApprovedExecuteResult,
  FilesystemToolset,
} from "../tools/index.js";
import {
  createTestSandbox,
  createCLISandbox,
  type Sandbox,
  type TrustLevel,
} from "../sandbox/index.js";

/**
 * Result of a worker execution.
 */
export interface WorkerResult {
  /** Whether execution completed successfully */
  success: boolean;
  /** Final text response from the LLM */
  response?: string;
  /** Error message if failed */
  error?: string;
  /** Number of tool calls made */
  toolCallCount: number;
  /** Token usage statistics */
  tokens?: { input: number; output: number };
  /** Total cost */
  cost?: number;
}

/**
 * Options for creating a WorkerRuntime.
 */
export interface WorkerRuntimeOptions {
  /** The worker definition to execute */
  worker: WorkerDefinition;
  /** Model from CLI --model flag (validated against compatible_models) */
  model?: string;
  /** Caller's model when delegating from another worker (validated against compatible_models) */
  callerModel?: string;
  /** Approval mode */
  approvalMode?: ApprovalMode;
  /** Approval callback for interactive mode */
  approvalCallback?: ApprovalCallback;
  /** Trust level for sandbox */
  trustLevel?: TrustLevel;
  /** Project root for CLI sandbox */
  projectRoot?: string;
  /** Use test sandbox instead of CLI sandbox */
  useTestSandbox?: boolean;
  /** Maximum tool call iterations */
  maxIterations?: number;
  /** Inject a client directly (for testing with ReplayClient) */
  client?: ChatClient;
  /** Inject a context directly (for testing) */
  context?: Context;
}

/**
 * Input for running a worker.
 * Can be a simple string or an object with content and optional attachments.
 */
export type RunInput =
  | string
  | {
      /** Text content */
      content: string;
      /** Optional file attachments (images, etc.) */
      attachments?: Attachment[];
    };

/**
 * Re-export Attachment type for convenience.
 */
export type { Attachment };

/**
 * Parses a model identifier like "anthropic:claude-3-5-sonnet-20241022"
 * into provider and model parts.
 */
function parseModelId(modelId: string): { provider: string; model: string } {
  const parts = modelId.split(":");
  if (parts.length !== 2) {
    throw new Error(`Invalid model ID format: ${modelId}. Expected format: provider:model`);
  }
  return { provider: parts[0], model: parts[1] };
}

/**
 * Match a model ID against a glob pattern.
 * Supports wildcards: "*" matches any sequence of characters.
 *
 * Examples:
 *   - "*" matches anything
 *   - "anthropic:*" matches any Anthropic model
 *   - "anthropic:claude-haiku-*" matches Haiku variants
 */
export function matchModelPattern(modelId: string, pattern: string): boolean {
  // Convert glob pattern to regex
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&") // Escape regex special chars except *
    .replace(/\*/g, ".*"); // Convert * to .*
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(modelId);
}

/**
 * Check if a model is compatible with a worker's compatible_models list.
 *
 * @param modelId - The model to check
 * @param compatibleModels - List of patterns, or undefined for "any model"
 * @returns true if compatible, false otherwise
 */
function isModelCompatible(modelId: string, compatibleModels: string[] | undefined): boolean {
  // If not set, any model is compatible
  if (compatibleModels === undefined) {
    return true;
  }

  // Empty array is invalid config - should have been caught by validation
  if (compatibleModels.length === 0) {
    return false;
  }

  // Check if model matches any pattern
  return compatibleModels.some((pattern) => matchModelPattern(modelId, pattern));
}

/**
 * Model resolution result.
 */
export interface ModelResolution {
  model: string;
  source: "worker" | "cli" | "caller" | "default";
}

/**
 * Resolve the model to use based on priority order.
 *
 * Resolution order:
 *   1. Worker's `model` field (if set) → wins unconditionally
 *   2. CLI `--model` flag → validated against compatible_models
 *   3. Caller's model (inherited during delegation) → validated against compatible_models
 *   4. Default model → validated against compatible_models
 *   5. Error if none available
 */
function resolveModel(
  worker: WorkerDefinition,
  cliModel: string | undefined,
  callerModel: string | undefined
): ModelResolution {
  const compatibleModels = worker.compatible_models;

  // Validate compatible_models config
  if (compatibleModels !== undefined && compatibleModels.length === 0) {
    throw new Error(`Worker "${worker.name}" has empty compatible_models - this is invalid configuration`);
  }

  // 1. Worker's model wins unconditionally
  if (worker.model) {
    return { model: worker.model, source: "worker" };
  }

  // 2. CLI model - validated against compatible_models
  if (cliModel) {
    if (!isModelCompatible(cliModel, compatibleModels)) {
      const patterns = compatibleModels?.join(", ") || "any";
      throw new Error(
        `Model "${cliModel}" is not compatible with worker "${worker.name}". ` +
        `Compatible patterns: ${patterns}`
      );
    }
    return { model: cliModel, source: "cli" };
  }

  // 3. Caller's model - validated against compatible_models
  if (callerModel) {
    if (!isModelCompatible(callerModel, compatibleModels)) {
      const patterns = compatibleModels?.join(", ") || "any";
      throw new Error(
        `Caller model "${callerModel}" is not compatible with worker "${worker.name}". ` +
        `Compatible patterns: ${patterns}`
      );
    }
    return { model: callerModel, source: "caller" };
  }

  // 4. Default model - validated against compatible_models
  const defaultModel = "anthropic:claude-haiku-4-5";
  if (!isModelCompatible(defaultModel, compatibleModels)) {
    const patterns = compatibleModels?.join(", ") || "any";
    throw new Error(
      `No model specified and default "${defaultModel}" is not compatible with worker "${worker.name}". ` +
      `Compatible patterns: ${patterns}. Please specify a model with --model.`
    );
  }
  return { model: defaultModel, source: "default" };
}

/**
 * Creates a chat client for the given model.
 * API keys are read from environment variables.
 */
function createClient(modelId: string): ChatClient {
  const { provider, model } = parseModelId(modelId);

  switch (provider) {
    case "anthropic": {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY environment variable is required");
      }
      return lemmy.anthropic({ apiKey, model });
    }
    case "openai": {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY environment variable is required");
      }
      return lemmy.openai({ apiKey, model });
    }
    case "google": {
      const apiKey = process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        throw new Error("GOOGLE_API_KEY environment variable is required");
      }
      return lemmy.google({ apiKey, model });
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Runtime for executing workers.
 */
export class WorkerRuntime {
  private worker: WorkerDefinition;
  private options: WorkerRuntimeOptions;
  private context: Context;
  private client: ChatClient;
  private approvalController: ApprovalController;
  private executor!: ApprovedExecutor; // Initialized in initialize()
  private sandbox?: Sandbox;
  private toolsets: ApprovalToolset[] = [];
  private modelResolution: ModelResolution;

  constructor(options: WorkerRuntimeOptions) {
    this.worker = options.worker;
    this.options = options;

    // Use injected context or create new one
    this.context = options.context ?? new Context();
    this.context.setSystemMessage(this.worker.instructions);

    // Use injected client or create from model resolution
    if (options.client) {
      this.client = options.client;
      this.modelResolution = {
        model: `${options.client.getProvider()}:${options.client.getModel()}`,
        source: "worker",
      };
    } else {
      // Resolve model using priority order with compatibility validation
      this.modelResolution = resolveModel(
        this.worker,
        options.model,
        options.callerModel
      );
      this.client = createClient(this.modelResolution.model);
    }

    // Determine approval mode - default to "interactive" for safety
    const approvalMode = options.approvalMode || "interactive";

    // Validate that interactive mode has a callback
    if (approvalMode === "interactive" && !options.approvalCallback) {
      throw new Error(
        'Approval mode "interactive" requires an approvalCallback. ' +
        'Either provide a callback or explicitly set approvalMode to "approve_all".'
      );
    }

    // Create approval controller
    this.approvalController = new ApprovalController({
      mode: approvalMode,
      approvalCallback: options.approvalCallback,
    });
  }

  /**
   * Get the resolved model and its source.
   */
  getModelResolution(): ModelResolution {
    return this.modelResolution;
  }

  /**
   * Initialize the runtime (creates sandbox and registers tools).
   */
  async initialize(): Promise<void> {
    // Create sandbox
    if (this.options.useTestSandbox) {
      const { sandbox } = await createTestSandbox({
        trustLevel: this.options.trustLevel || "session",
      });
      this.sandbox = sandbox;
    } else if (this.options.projectRoot) {
      const { sandbox } = await createCLISandbox({
        projectRoot: this.options.projectRoot,
        trustLevel: this.options.trustLevel || "session",
      });
      this.sandbox = sandbox;
    }

    // Register tools based on worker config
    await this.registerTools();

    // Create executor with composite toolset
    const compositeToolset = this.toolsets.length > 0
      ? this.createCompositeToolset()
      : undefined;

    // Extract security context from sandbox for approval requests
    let approvalSecurityContext: ApprovalSecurityContext | undefined;
    if (this.sandbox) {
      const sandboxContext = this.sandbox.getSecurityContext();
      approvalSecurityContext = {
        trustLevel: sandboxContext.trustLevel,
      };
    }

    this.executor = new ApprovedExecutor({
      context: this.context,
      approvalController: this.approvalController,
      toolset: compositeToolset,
      securityContext: approvalSecurityContext,
    });
  }

  /**
   * Create a composite toolset that delegates to all registered toolsets.
   */
  private createCompositeToolset(): ApprovalToolset {
    const toolsets = this.toolsets;
    return {
      needsApproval(name: string, toolArgs: Record<string, unknown>, ctx: unknown) {
        // Check each toolset - first blocked or needs_approval wins
        for (const ts of toolsets) {
          const result = ts.needsApproval(name, toolArgs, ctx);
          if (result.isBlocked || result.isNeedsApproval) {
            return result;
          }
        }
        // If all toolsets say pre-approved, return pre-approved
        return ApprovalResult.preApproved();
      },
      getApprovalDescription(name: string, toolArgs: Record<string, unknown>, ctx: unknown) {
        // Find the first toolset that provides a custom description
        for (const ts of toolsets) {
          if (supportsApprovalDescription(ts)) {
            return ts.getApprovalDescription(name, toolArgs, ctx);
          }
        }
        // Default fallback
        return `Execute tool: ${name}`;
      },
    };
  }

  /**
   * Register tools based on worker configuration.
   */
  private async registerTools(): Promise<void> {
    const toolsetsConfig = this.worker.toolsets || {};

    for (const [toolsetName] of Object.entries(toolsetsConfig)) {
      switch (toolsetName) {
        case "filesystem":
          if (!this.sandbox) {
            throw new Error("Filesystem toolset requires a sandbox. Set projectRoot or useTestSandbox.");
          }
          // Pass worker's sandbox config to honor write_approval and other restrictions
          const fsToolset = new FilesystemToolset({
            sandbox: this.sandbox,
            workerSandboxConfig: this.worker.sandbox,
          });
          this.toolsets.push(fsToolset);
          const fsTools = fsToolset.getTools();
          for (const tool of fsTools) {
            this.context.addTool(tool);
          }
          break;

        // Add more toolsets here as they're implemented
        default:
          // Silently skip unknown toolsets - they may be handled elsewhere
          break;
      }
    }
  }

  /**
   * Execute the worker with the given input.
   * @param input - Text string or object with content and optional attachments
   */
  async run(input: RunInput): Promise<WorkerResult> {
    const maxIterations = this.options.maxIterations || 10;
    let toolCallCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;

    try {
      // Normalize input to AskInput format
      const askInput: string | AskInput = typeof input === "string"
        ? input
        : { content: input.content, attachments: input.attachments };

      // Initial ask
      let result = await this.client.ask(askInput, { context: this.context });

      for (let iteration = 0; iteration < maxIterations; iteration++) {
        if (result.type === "error") {
          return {
            success: false,
            error: result.error.message,
            toolCallCount,
            tokens: { input: totalInputTokens, output: totalOutputTokens },
            cost: totalCost,
          };
        }

        // Accumulate tokens and cost
        totalInputTokens += result.tokens.input;
        totalOutputTokens += result.tokens.output;
        totalCost += result.cost;

        // Check if we have tool calls
        const toolCalls = result.message.toolCalls;
        if (!toolCalls || toolCalls.length === 0) {
          // No tool calls, we're done
          return {
            success: true,
            response: result.message.content || "",
            toolCallCount,
            tokens: { input: totalInputTokens, output: totalOutputTokens },
            cost: totalCost,
          };
        }

        // Execute tools with approval
        const toolResults: ToolResult[] = [];
        for (const toolCall of toolCalls) {
          toolCallCount++;
          const execResult = await this.executor.executeTool(toolCall);
          toolResults.push(this.formatToolResult(toolCall.id, execResult));
        }

        // Send tool results back to LLM
        const askInput: AskInput = { toolResults };
        result = await this.client.ask(askInput, { context: this.context });
      }

      // Hit max iterations
      return {
        success: false,
        error: `Maximum iterations (${maxIterations}) exceeded`,
        toolCallCount,
        tokens: { input: totalInputTokens, output: totalOutputTokens },
        cost: totalCost,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        toolCallCount,
        tokens: { input: totalInputTokens, output: totalOutputTokens },
        cost: totalCost,
      };
    }
  }

  /**
   * Format a tool execution result for the LLM.
   */
  private formatToolResult(toolCallId: string, result: ApprovedExecuteResult): ToolResult {
    if (result.success) {
      return {
        toolCallId,
        content: typeof result.result === "string"
          ? result.result
          : JSON.stringify(result.result, null, 2),
      };
    }

    // Format error for LLM
    let errorMessage = result.error.message;
    if (result.blocked) {
      errorMessage = `[BLOCKED] ${errorMessage}`;
    } else if (result.denied) {
      errorMessage = `[DENIED] ${errorMessage}`;
    }

    return {
      toolCallId,
      content: `Error: ${errorMessage}`,
    };
  }

  /**
   * Get the conversation context.
   */
  getContext(): Context {
    return this.context;
  }

  /**
   * Get the sandbox (if available).
   */
  getSandbox(): Sandbox | undefined {
    return this.sandbox;
  }

  /**
   * Get the approval controller.
   */
  getApprovalController(): ApprovalController {
    return this.approvalController;
  }
}

/**
 * Create and initialize a worker runtime.
 */
export async function createWorkerRuntime(options: WorkerRuntimeOptions): Promise<WorkerRuntime> {
  const runtime = new WorkerRuntime(options);
  await runtime.initialize();
  return runtime;
}
