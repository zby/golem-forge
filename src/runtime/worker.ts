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
} from "@mariozechner/lemmy";
import type { WorkerDefinition } from "../worker/schema.js";
import {
  ApprovalController,
  ApprovalResult,
  type ApprovalCallback,
  type ApprovalMode,
} from "../approval/index.js";
import {
  ApprovedExecutor,
  type ApprovalToolset,
  type ApprovedExecuteResult,
  FilesystemToolset,
  createFilesystemTools,
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
  /** Model to use (overrides worker default) */
  model?: string;
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
}

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

  constructor(options: WorkerRuntimeOptions) {
    this.worker = options.worker;
    this.options = options;

    // Create context
    this.context = new Context();
    this.context.setSystemMessage(this.worker.instructions);

    // Create client
    const model = options.model || this.worker.model || "anthropic:claude-haiku-4-5";
    this.client = createClient(model);

    // Create approval controller
    this.approvalController = new ApprovalController({
      mode: options.approvalMode || "approve_all",
      approvalCallback: options.approvalCallback,
    });
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

    this.executor = new ApprovedExecutor({
      context: this.context,
      approvalController: this.approvalController,
      toolset: compositeToolset,
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
          const fsToolset = new FilesystemToolset(this.sandbox);
          this.toolsets.push(fsToolset);
          const fsTools = createFilesystemTools(this.sandbox);
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
   */
  async run(input: string): Promise<WorkerResult> {
    const maxIterations = this.options.maxIterations || 10;
    let toolCallCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;

    try {
      // Initial ask
      let result = await this.client.ask(input, { context: this.context });

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
