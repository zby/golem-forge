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
  type ZoneApprovalMap,
} from "../tools/index.js";
import { WorkerRegistry } from "../worker/registry.js";
import {
  createSandbox,
  createTestSandbox,
  type Sandbox,
  type SandboxConfig,
} from "../sandbox/index.js";
import type { Attachment } from "../ai/types.js";
import type { RuntimeEventCallback } from "./events.js";

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
  /** Model to use (already resolved from CLI/env/config by caller) */
  model?: string;
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
  /** Custom sandbox configuration (from project config) */
  sandboxConfig?: SandboxConfig;
  /** Callback for runtime events (for tracing/debugging) */
  onEvent?: RuntimeEventCallback;
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
 * Validate and resolve the model for a worker.
 *
 * The model should already be resolved by the caller (CLI/env/config priority).
 * This function validates it against the worker's compatible_models constraints.
 */
function resolveModel(
  worker: WorkerDefinition,
  model: string | undefined
): string {
  const compatibleModels = worker.compatible_models;

  // Validate compatible_models config
  if (compatibleModels !== undefined && compatibleModels.length === 0) {
    throw new Error(`Worker "${worker.name}" has empty compatible_models - this is invalid configuration`);
  }

  // Validate model against compatible_models
  if (model) {
    if (!isModelCompatible(model, compatibleModels)) {
      const patterns = compatibleModels?.join(", ") || "any";
      throw new Error(
        `Model "${model}" is not compatible with worker "${worker.name}". ` +
        `Compatible patterns: ${patterns}`
      );
    }
    return model;
  }

  // No model available - error with helpful message
  const patternsHint = compatibleModels ? ` Compatible patterns: ${compatibleModels.join(", ")}` : "";
  throw new Error(
    `No model specified for worker "${worker.name}". ` +
    `Set GOLEM_FORGE_MODEL environment variable or use --model flag.${patternsHint}`
  );
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
  private resolvedModelId: string;
  private tools: Record<string, Tool> = {};
  private approvalController: ApprovalController;
  private sandbox?: Sandbox;
  private onEvent?: RuntimeEventCallback;

  constructor(options: WorkerRuntimeOptions) {
    this.worker = options.worker;
    this.options = options;

    // Use injected model or create from model resolution
    if (options.injectedModel) {
      this.model = options.injectedModel;
      this.resolvedModelId = "injected:model";
    } else {
      // Validate model against compatible_models
      this.resolvedModelId = resolveModel(this.worker, options.model);
      this.model = createModel(this.resolvedModelId);
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

    // Store event callback for tracing
    this.onEvent = options.onEvent;
  }

  /**
   * Emit a runtime event if a callback is registered.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private emit(event: any): void {
    if (this.onEvent) {
      this.onEvent({ ...event, timestamp: new Date() });
    }
  }

  /**
   * Get the resolved model ID.
   */
  getModelId(): string {
    return this.resolvedModelId;
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
    } else if (this.options.sandboxConfig) {
      // Use custom sandbox configuration from project config
      this.sandbox = await createSandbox(this.options.sandboxConfig);
    } else if (this.options.projectRoot) {
      // Default sandbox configuration (backwards compatible)
      this.sandbox = await createSandbox({
        mode: 'sandboxed',
        root: `${this.options.projectRoot}/sandbox`,
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

          // Build zone approval config from worker's sandbox zones
          const zoneApprovalConfig: ZoneApprovalMap = {};
          const zones = this.worker.sandbox?.zones;
          if (zones) {
            for (const zone of zones) {
              if (zone.approval) {
                zoneApprovalConfig[zone.name] = {
                  write: zone.approval.write,
                  delete: zone.approval.delete,
                };
              }
              // If no approval config, zone uses defaults (ask for approval)
            }
          }

          // FilesystemToolset creates tools with needsApproval set based on config
          const fsToolset = new FilesystemToolset({
            sandbox: this.sandbox,
            zoneApprovalConfig: Object.keys(zoneApprovalConfig).length > 0
              ? zoneApprovalConfig
              : undefined,
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

          // Use async factory to create named tools for each worker
          const workerToolset = await WorkerCallToolset.create({
            registry,
            allowedWorkers,
            sandbox: this.sandbox,
            approvalController: this.approvalController,
            approvalCallback: this.options.approvalCallback,
            approvalMode: this.options.approvalMode || "interactive",
            delegationContext: this.options.delegationContext,
            projectRoot: this.options.projectRoot,
            model: this.options.model,
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
    const startTime = Date.now();

    // Emit execution start event
    this.emit({
      type: "execution_start",
      workerName: this.worker.name,
      model: this.resolvedModelId,
    });

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
        const iterationNum = iteration + 1;

        // Emit message_send event
        this.emit({
          type: "message_send",
          iteration: iterationNum,
          messages: messages.map(m => ({ role: m.role as "system" | "user" | "assistant" | "tool", content: m.content })),
          toolCount: Object.keys(this.tools).length,
        });

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

        // Emit response_receive event
        this.emit({
          type: "response_receive",
          iteration: iterationNum,
          text: result.text || undefined,
          toolCalls: (toolCalls || []).map(tc => ({
            id: tc.toolCallId,
            name: tc.toolName,
            args: getToolArgs(tc),
          })),
          usage: result.usage ? {
            input: result.usage.inputTokens,
            output: result.usage.outputTokens,
          } : undefined,
        });
        if (!toolCalls || toolCalls.length === 0) {
          // No tool calls, we're done
          const response = result.text || "";
          this.emit({
            type: "execution_end",
            success: true,
            response,
            totalIterations: iterationNum,
            totalToolCalls: toolCallCount,
            totalTokens: { input: totalInputTokens, output: totalOutputTokens },
            durationMs: Date.now() - startTime,
          });
          return {
            success: true,
            response,
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
        const toolTotal = toolCalls.length;

        for (let toolIdx = 0; toolIdx < toolCalls.length; toolIdx++) {
          const tc = toolCalls[toolIdx];
          const toolStartTime = Date.now();
          toolCallCount++;

          const toolName = tc.toolName;
          const toolArgs = getToolArgs(tc);
          const tool = this.tools[toolName];

          // Emit tool_call_start event
          this.emit({
            type: "tool_call_start",
            iteration: iterationNum,
            toolIndex: toolIdx + 1,
            toolTotal,
            toolCallId: tc.toolCallId,
            toolName,
            toolArgs,
          });

          let output: unknown;
          let isError = false;

          if (!tool) {
            // Tool doesn't exist
            output = `Error: Tool not found: ${toolName}`;
            isError = true;
          } else if (!tool.execute) {
            // Tool has no execute function
            output = `Error: Tool ${toolName} has no execute function`;
            isError = true;
          } else {
            // Check if tool needs approval
            const needsApproval = typeof tool.needsApproval === 'function'
              ? await tool.needsApproval(toolArgs, { toolCallId: tc.toolCallId, messages })
              : tool.needsApproval;

            if (needsApproval) {
              // Emit approval_request event
              this.emit({
                type: "approval_request",
                toolName,
                toolArgs,
                description: `Execute tool: ${toolName}`,
              });

              // Get approval from controller
              const decision = await this.approvalController.requestApproval({
                toolName,
                toolArgs,
                description: `Execute tool: ${toolName}`,
              });

              // Emit approval_decision event
              this.emit({
                type: "approval_decision",
                toolName,
                approved: decision.approved,
                cached: false, // TODO: detect if cached from controller
                remember: decision.remember || "none",
              });

              if (!decision.approved) {
                output = `Error: [DENIED] Tool execution denied${decision.note ? `: ${decision.note}` : ''}`;
                isError = true;
              } else {
                // Execute approved tool
                try {
                  output = await tool.execute(toolArgs, { toolCallId: tc.toolCallId, messages });
                } catch (err) {
                  output = `Error: ${err instanceof Error ? err.message : String(err)}`;
                  isError = true;
                }
              }
            } else {
              // Pre-approved, execute directly
              try {
                output = await tool.execute(toolArgs, { toolCallId: tc.toolCallId, messages });
              } catch (err) {
                output = `Error: ${err instanceof Error ? err.message : String(err)}`;
                isError = true;
              }
            }
          }

          // Emit tool_call_end or tool_call_error event
          const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
          const maxOutputLen = 1000;
          if (isError) {
            this.emit({
              type: "tool_call_error",
              iteration: iterationNum,
              toolCallId: tc.toolCallId,
              toolName,
              error: outputStr,
            });
          } else {
            this.emit({
              type: "tool_call_end",
              iteration: iterationNum,
              toolCallId: tc.toolCallId,
              toolName,
              output: outputStr.length > maxOutputLen ? outputStr.slice(0, maxOutputLen) : outputStr,
              truncated: outputStr.length > maxOutputLen,
              durationMs: Date.now() - toolStartTime,
            });
          }

          toolResultMessages.push({
            type: "tool-result",
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            // AI SDK v6 requires output to be wrapped in { type: "json", value: ... }
            output: { type: "json", value: output },
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
      const maxIterError = `Maximum iterations (${maxIterations}) exceeded`;
      this.emit({
        type: "execution_error",
        success: false,
        error: maxIterError,
        totalIterations: maxIterations,
        totalToolCalls: toolCallCount,
        durationMs: Date.now() - startTime,
      });
      return {
        success: false,
        error: maxIterError,
        toolCallCount,
        tokens: { input: totalInputTokens, output: totalOutputTokens },
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.emit({
        type: "execution_error",
        success: false,
        error: errorMsg,
        totalIterations: 0,
        totalToolCalls: toolCallCount,
        durationMs: Date.now() - startTime,
      });
      return {
        success: false,
        error: errorMsg,
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
