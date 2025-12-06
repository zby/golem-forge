/**
 * Worker Execution Runtime
 *
 * Executes workers with tool support and approval checking.
 * Manages the LLM conversation loop with tool calls.
 */

import { generateText, type ModelMessage, type Tool, type LanguageModel } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import type { WorkerDefinition } from "../worker/schema.js";
import {
  ApprovalController,
  type ApprovalCallback,
  type ApprovalMode,
} from "../approval/index.js";
import {
  FilesystemToolset,
  WorkerCallToolset,
  type DelegationContext,
} from "../tools/index.js";
import { WorkerRegistry } from "../worker/registry.js";
import {
  createSandbox,
  createTestSandbox,
  type Sandbox,
} from "../sandbox/index.js";
import type { Attachment } from "../ai/types.js";

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
  /** Default model from project config (lowest priority, before hardcoded default) */
  configModel?: string;
  /** Approval mode */
  approvalMode?: ApprovalMode;
  /** Approval callback for interactive mode */
  approvalCallback?: ApprovalCallback;
  /** Project root for CLI sandbox */
  projectRoot?: string;
  /** Use test sandbox instead of CLI sandbox */
  useTestSandbox?: boolean;
  /** Maximum tool call iterations */
  maxIterations?: number;
  /** Inject a model directly (for testing) */
  injectedModel?: LanguageModel;
  /** Shared approval controller (for worker delegation) */
  sharedApprovalController?: ApprovalController;
  /** Shared sandbox (for worker delegation) */
  sharedSandbox?: Sandbox;
  /** Delegation context when called by another worker */
  delegationContext?: DelegationContext;
  /** Worker registry for delegation lookups */
  registry?: WorkerRegistry;
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
      /** Optional file attachments (images, PDFs, etc.) */
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
 * Extract tool arguments from an AI SDK tool call.
 * AI SDK v6 uses 'input' property, but we normalize to 'args'.
 */
function getToolArgs(toolCall: { args?: unknown; input?: unknown }): Record<string, unknown> {
  // AI SDK v6 uses 'input', earlier versions used 'args'
  const rawArgs = toolCall.input ?? toolCall.args ?? {};
  return rawArgs as Record<string, unknown>;
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
  source: "worker" | "cli" | "caller" | "config" | "default";
}

/**
 * Resolve the model to use based on priority order.
 *
 * Resolution order:
 *   1. Worker's `model` field (if set) → wins unconditionally
 *   2. CLI `--model` flag → validated against compatible_models
 *   3. Caller's model (inherited during delegation) → validated against compatible_models
 *   4. Project config model → validated against compatible_models
 *   5. Hardcoded default model → validated against compatible_models
 *   6. Error if none available
 */
function resolveModel(
  worker: WorkerDefinition,
  cliModel: string | undefined,
  callerModel: string | undefined,
  configModel: string | undefined
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

  // 4. Project config model - validated against compatible_models
  if (configModel) {
    if (!isModelCompatible(configModel, compatibleModels)) {
      const patterns = compatibleModels?.join(", ") || "any";
      throw new Error(
        `Config model "${configModel}" is not compatible with worker "${worker.name}". ` +
        `Compatible patterns: ${patterns}`
      );
    }
    return { model: configModel, source: "config" };
  }

  // 5. Hardcoded default model - validated against compatible_models
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
 * Creates a language model for the given model ID.
 * API keys are read from environment variables automatically by providers.
 */
function createModel(modelId: string): LanguageModel {
  const { provider, model } = parseModelId(modelId);

  switch (provider) {
    case "anthropic": {
      // Reads ANTHROPIC_API_KEY from environment automatically
      return anthropic(model);
    }
    case "openai": {
      // Reads OPENAI_API_KEY from environment automatically
      return openai(model);
    }
    case "google": {
      // Reads GOOGLE_GENERATIVE_AI_API_KEY from environment automatically
      return google(model);
    }
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

/**
 * Runtime for executing workers.
 * Uses AI SDK's native needsApproval for tool approval.
 */
export class WorkerRuntime {
  private worker: WorkerDefinition;
  private options: WorkerRuntimeOptions;
  private model: LanguageModel;
  private tools: Record<string, Tool> = {};
  private approvalController: ApprovalController;
  private sandbox?: Sandbox;
  private modelResolution: ModelResolution;

  constructor(options: WorkerRuntimeOptions) {
    this.worker = options.worker;
    this.options = options;

    // Use injected model or create from model resolution
    if (options.injectedModel) {
      this.model = options.injectedModel;
      this.modelResolution = {
        model: "injected:model",
        source: "worker",
      };
    } else {
      // Resolve model using priority order with compatibility validation
      this.modelResolution = resolveModel(
        this.worker,
        options.model,
        options.callerModel,
        options.configModel
      );
      this.model = createModel(this.modelResolution.model);
    }

    // Determine approval mode - default to "interactive" for safety
    const approvalMode = options.approvalMode || "interactive";

    // Validate that interactive mode has a callback
    if (approvalMode === "interactive" && !options.approvalCallback && !options.sharedApprovalController) {
      throw new Error(
        'Approval mode "interactive" requires an approvalCallback. ' +
        'Either provide a callback or explicitly set approvalMode to "approve_all".'
      );
    }

    // Use shared approval controller (for delegation) or create new one
    if (options.sharedApprovalController) {
      this.approvalController = options.sharedApprovalController;
    } else {
      this.approvalController = new ApprovalController({
        mode: approvalMode,
        approvalCallback: options.approvalCallback,
      });
    }
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
    // Use shared sandbox (for delegation) or create new one
    if (this.options.sharedSandbox) {
      this.sandbox = this.options.sharedSandbox;
    } else if (this.options.useTestSandbox) {
      this.sandbox = await createTestSandbox();
    } else if (this.options.projectRoot) {
      this.sandbox = await createSandbox({
        mode: 'sandboxed',
        root: `${this.options.projectRoot}/.sandbox`,
      });
    }

    // Register tools based on worker config
    // Tools have needsApproval set directly, SDK handles approval flow
    await this.registerTools();
  }

  /**
   * Register tools based on worker configuration.
   * Tools have needsApproval set directly - SDK handles approval flow.
   */
  private async registerTools(): Promise<void> {
    const toolsetsConfig = this.worker.toolsets || {};

    for (const [toolsetName, toolsetConfig] of Object.entries(toolsetsConfig)) {
      switch (toolsetName) {
        case "filesystem":
          if (!this.sandbox) {
            throw new Error("Filesystem toolset requires a sandbox. Set projectRoot or useTestSandbox.");
          }
          // FilesystemToolset creates tools with needsApproval set based on config
          const fsToolset = new FilesystemToolset({
            sandbox: this.sandbox,
          });
          // Register each tool by its name property
          for (const tool of fsToolset.getTools()) {
            this.tools[tool.name] = tool;
          }
          break;

        case "workers": {
          // Worker delegation toolset - requires allowed_workers list
          const workersConfig = toolsetConfig as { allowed_workers?: string[] } | undefined;
          const allowedWorkers = workersConfig?.allowed_workers || [];

          if (allowedWorkers.length === 0) {
            throw new Error("Workers toolset requires 'allowed_workers' list in config.");
          }

          const registry = this.options.registry || new WorkerRegistry();
          if (this.options.projectRoot) {
            registry.addSearchPath(this.options.projectRoot);
          }

          const workerToolset = new WorkerCallToolset({
            registry,
            allowedWorkers,
            sandbox: this.sandbox,
            approvalController: this.approvalController,
            approvalCallback: this.options.approvalCallback,
            approvalMode: this.options.approvalMode || "interactive",
            delegationContext: this.options.delegationContext,
            projectRoot: this.options.projectRoot,
          });
          for (const tool of workerToolset.getTools()) {
            this.tools[tool.name] = tool;
          }
          break;
        }

        default:
          // Silently skip unknown toolsets - they may be handled elsewhere
          break;
      }
    }
  }

  /**
   * Execute the worker with the given input.
   * Uses AI SDK's native needsApproval for tool approval.
   * @param input - Text string or object with content and optional attachments
   */
  async run(input: RunInput): Promise<WorkerResult> {
    const maxIterations = this.options.maxIterations || 10;
    let toolCallCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
      // Build initial messages
      const messages: ModelMessage[] = [
        { role: "system", content: this.worker.instructions },
      ];

      // Add user message with optional attachments
      if (typeof input === "string") {
        messages.push({ role: "user", content: input });
      } else {
        // Build user content with attachments
        const userContent: Array<{ type: "text"; text: string } | { type: "file"; data: Buffer | string; mediaType: string }> = [
          { type: "text", text: input.content },
        ];

        if (input.attachments) {
          for (const att of input.attachments) {
            userContent.push({
              type: "file",
              data: att.data,
              mediaType: att.mimeType,
            });
          }
        }

        messages.push({ role: "user", content: userContent });
      }

      // Determine if we have tools to use
      const hasTools = Object.keys(this.tools).length > 0;

      for (let iteration = 0; iteration < maxIterations; iteration++) {
        // Call generateText - SDK handles tool execution and approval
        const result = await generateText({
          model: this.model,
          messages,
          tools: hasTools ? this.tools : undefined,
        });

        // Accumulate tokens
        totalInputTokens += result.usage?.inputTokens || 0;
        totalOutputTokens += result.usage?.outputTokens || 0;

        // Check if we have tool calls
        const toolCalls = result.toolCalls;
        if (!toolCalls || toolCalls.length === 0) {
          // No tool calls, we're done
          return {
            success: true,
            response: result.text || "",
            toolCallCount,
            tokens: { input: totalInputTokens, output: totalOutputTokens },
          };
        }

        // Add assistant message with tool calls to history
        messages.push({
          role: "assistant",
          content: [
            ...(result.text ? [{ type: "text" as const, text: result.text }] : []),
            ...toolCalls.map(tc => ({
              type: "tool-call" as const,
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              input: getToolArgs(tc),
            })),
          ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        // Execute tools ourselves
        const toolResultMessages: Array<{ type: "tool-result"; toolCallId: string; toolName: string; output: unknown }> = [];

        for (const tc of toolCalls) {
          toolCallCount++;

          const toolName = tc.toolName;
          const toolArgs = getToolArgs(tc);
          const tool = this.tools[toolName];

          let output: unknown;

          if (!tool) {
            // Tool doesn't exist
            output = `Error: Tool not found: ${toolName}`;
          } else if (!tool.execute) {
            // Tool has no execute function
            output = `Error: Tool ${toolName} has no execute function`;
          } else {
            // Check if tool needs approval
            const needsApproval = typeof tool.needsApproval === 'function'
              ? await tool.needsApproval(toolArgs, { toolCallId: tc.toolCallId, messages })
              : tool.needsApproval;

            if (needsApproval) {
              // Get approval from controller
              const decision = await this.approvalController.requestApproval({
                toolName,
                toolArgs,
                description: `Execute tool: ${toolName}`,
              });

              if (!decision.approved) {
                output = `Error: [DENIED] Tool execution denied${decision.note ? `: ${decision.note}` : ''}`;
              } else {
                // Execute approved tool
                try {
                  output = await tool.execute(toolArgs, { toolCallId: tc.toolCallId, messages });
                } catch (err) {
                  output = `Error: ${err instanceof Error ? err.message : String(err)}`;
                }
              }
            } else {
              // Pre-approved, execute directly
              try {
                output = await tool.execute(toolArgs, { toolCallId: tc.toolCallId, messages });
              } catch (err) {
                output = `Error: ${err instanceof Error ? err.message : String(err)}`;
              }
            }
          }

          toolResultMessages.push({
            type: "tool-result",
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            output,
          });
        }

        // Add tool results to messages
        messages.push({
          role: "tool",
          content: toolResultMessages,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
      }

      // Hit max iterations
      return {
        success: false,
        error: `Maximum iterations (${maxIterations}) exceeded`,
        toolCallCount,
        tokens: { input: totalInputTokens, output: totalOutputTokens },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        toolCallCount,
        tokens: { input: totalInputTokens, output: totalOutputTokens },
      };
    }
  }

  /**
   * Get the registered tools.
   */
  getTools(): Record<string, Tool> {
    return this.tools;
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
