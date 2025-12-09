/**
 * Worker Execution Runtime
 *
 * Executes workers with tool support and approval checking.
 * Manages the LLM conversation loop with tool calls.
 */

import * as path from "path";
import { generateText, type ModelMessage, type Tool, type LanguageModel } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import type { WorkerDefinition } from "../worker/schema.js";
import { ApprovalController } from "../approval/index.js";
import {
  FilesystemToolset,
  WorkerCallToolset,
  createCustomToolset,
  CustomToolsetConfigSchema,
  ToolsetRegistry,
  type CustomToolsetConfig,
} from "../tools/index.js";
import { WorkerRegistry } from "../worker/registry.js";
import {
  createMountSandbox,
  createMountSandboxAsync,
  createTestSandbox,
  type FileOperations,
} from "../sandbox/index.js";
import type { Attachment } from "../ai/types.js";
import type { RuntimeEventCallback, RuntimeEventData } from "./events.js";
import { ToolExecutor, type ToolCall as ToolExecutorCall } from "./tool-executor.js";
import type {
  WorkerRunner,
  WorkerRunnerFactory,
  WorkerRunnerOptions,
  WorkerResult,
  RunInput,
} from "./interfaces.js";
import type { RuntimeUI } from "@golem-forge/core";

// Re-export types from interfaces.ts
export type { WorkerResult, RunInput, WorkerRunner, WorkerRunnerFactory, WorkerRunnerOptions } from "./interfaces.js";

/**
 * Options for creating a WorkerRuntime.
 * Alias for WorkerRunnerOptions - single source of truth in interfaces.ts.
 */
export type WorkerRuntimeOptions = WorkerRunnerOptions;

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
  // BACKCOMPAT: AI SDK v6 uses 'input', earlier versions used 'args'
  // Remove 'args' fallback once AI SDK <6 support is dropped
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
 * Implements WorkerRunner interface for dependency inversion.
 */
export class WorkerRuntime implements WorkerRunner {
  private worker: WorkerDefinition;
  private options: WorkerRuntimeOptions;
  private model: LanguageModel;
  private resolvedModelId: string;
  private tools: Record<string, Tool> = {};
  private approvalController: ApprovalController;
  private sandbox?: FileOperations;
  private onEvent?: RuntimeEventCallback;
  private runtimeUI?: RuntimeUI;
  private initialized = false;
  private toolExecutor?: ToolExecutor;
  private depth: number;
  private workerId: string;
  private uiSubscriptions: Array<() => void> = [];

  constructor(options: WorkerRuntimeOptions) {
    this.worker = options.worker;
    this.options = options;

    // Set depth (default 0 for root worker)
    const depth = options.depth ?? 0;
    if (depth < 0 || !Number.isInteger(depth)) {
      throw new Error(`Invalid worker depth: ${depth}. Depth must be a non-negative integer.`);
    }
    this.depth = depth;

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

    // Store RuntimeUI for UI events
    this.runtimeUI = options.runtimeUI;

    // Generate worker ID for UI tracking
    this.workerId = `worker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Emit a runtime event if a callback is registered.
   */
  private emit(event: RuntimeEventData): void {
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
    } else if (this.options.mountSandboxConfig) {
      // Mount-based sandbox (Docker-style)
      this.sandbox = await createMountSandboxAsync(this.options.mountSandboxConfig);
    } else if (this.options.useTestSandbox) {
      // Create temp sandbox for testing
      this.sandbox = await createTestSandbox();
    } else if (this.options.programRoot) {
      // Default: mount program root at /
      this.sandbox = createMountSandbox({ root: this.options.programRoot });
    }

    // Register tools based on worker config
    // Tools have needsApproval set directly, SDK handles approval flow
    await this.registerTools();

    // Create tool executor with registered tools
    this.toolExecutor = new ToolExecutor({
      tools: this.tools,
      approvalController: this.approvalController,
      onEvent: this.onEvent,
      runtimeUI: this.options.runtimeUI,
    });

    // Set up UI subscriptions for manual tool invocation and diff drill-down
    this.setupUISubscriptions();

    this.initialized = true;
  }

  /**
   * Set up subscriptions to UI action events.
   * Handles manual tool invocation and diff drill-down requests.
   */
  private setupUISubscriptions(): void {
    if (!this.runtimeUI) return;

    // Subscribe to manual tool invocation
    const unsubManualTool = this.runtimeUI.onManualToolInvoke(
      async (toolName: string, args: Record<string, unknown>) => {
        if (!this.toolExecutor) return;

        // Check if tool exists
        if (!this.tools[toolName]) {
          this.runtimeUI?.showStatus('error', `Unknown tool: ${toolName}`);
          return;
        }

        // Execute the tool via ToolExecutor
        const toolCallId = `manual-${Date.now()}`;
        const results = await this.toolExecutor.executeBatch(
          [{ toolCallId, toolName, toolArgs: args }],
          { messages: [], iteration: 0 }
        );

        // Show result
        const result = results[0];
        if (result) {
          if (result.isError) {
            const errorMsg = typeof result.output === 'string' ? result.output : JSON.stringify(result.output);
            this.runtimeUI?.showStatus('error', `Tool ${toolName} failed: ${errorMsg}`);
          } else {
            this.runtimeUI?.showStatus('info', `Manual tool ${toolName} completed`);
          }
        }
      }
    );
    this.uiSubscriptions.push(unsubManualTool);

    // Subscribe to getDiff requests for diff drill-down
    const unsubGetDiff = this.runtimeUI.onGetDiff(
      async (requestId: string, path: string) => {
        if (!this.sandbox) {
          this.runtimeUI?.showStatus('error', 'No sandbox available for diff');
          return;
        }

        // Read the file to show its content
        try {
          const content = await this.sandbox.read(path);
          // For drill-down, we show the current content (no original for comparison)
          this.runtimeUI?.showDiffContent(requestId, path, undefined, content, false);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          this.runtimeUI?.showStatus('error', `Failed to read ${path}: ${msg}`);
        }
      }
    );
    this.uiSubscriptions.push(unsubGetDiff);
  }

  /**
   * Clean up UI subscriptions.
   */
  private cleanupUISubscriptions(): void {
    for (const unsubscribe of this.uiSubscriptions) {
      unsubscribe();
    }
    this.uiSubscriptions = [];
  }

  /**
   * Register tools based on worker configuration.
   * Tools have needsApproval set directly - SDK handles approval flow.
   */
  private async registerTools(): Promise<void> {
    const toolsetsConfig = this.worker.toolsets || {};

    for (const [toolsetName, toolsetConfig] of Object.entries(toolsetsConfig)) {
      switch (toolsetName) {
        case "filesystem": {
          if (!this.sandbox) {
            throw new Error("Filesystem toolset requires a sandbox. Set programRoot or mountSandboxConfig.");
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
        }

        case "workers": {
          // Worker delegation toolset - requires allowed_workers list
          const workersConfig = toolsetConfig as { allowed_workers?: string[] } | undefined;
          const allowedWorkers = workersConfig?.allowed_workers || [];

          if (allowedWorkers.length === 0) {
            throw new Error("Workers toolset requires 'allowed_workers' list in config.");
          }

          const registry = this.options.registry || new WorkerRegistry();
          if (this.options.programRoot) {
            registry.addSearchPath(this.options.programRoot);
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
            programRoot: this.options.programRoot,
            model: this.options.model,
            workerRunnerFactory: defaultWorkerRunnerFactory,
            // Propagate event callback to child workers for nested tracing
            onEvent: this.onEvent,
            // Propagate runtimeUI to child workers for UI events
            runtimeUI: this.runtimeUI,
          });
          for (const tool of workerToolset.getTools()) {
            this.tools[tool.name] = tool;
          }
          break;
        }

        case "custom": {
          // Custom tools from a tools.ts module
          const parseResult = CustomToolsetConfigSchema.safeParse(toolsetConfig);
          if (!parseResult.success) {
            throw new Error(
              `Invalid custom toolset config: ${parseResult.error.message}`
            );
          }

          const customConfig: CustomToolsetConfig = parseResult.data;

          // Resolve module path relative to worker file or program root
          let modulePath = customConfig.module;
          if (!path.isAbsolute(modulePath)) {
            const baseDir = this.options.workerFilePath
              ? path.dirname(this.options.workerFilePath)
              : this.options.programRoot;

            if (!baseDir) {
              throw new Error(
                "Custom toolset requires workerFilePath or programRoot to resolve relative module paths."
              );
            }

            modulePath = path.resolve(baseDir, modulePath);
          }

          const customToolset = await createCustomToolset({
            modulePath,
            config: customConfig,
            sandbox: this.sandbox,
          });

          for (const tool of customToolset.getTools()) {
            this.tools[tool.name] = tool;
          }
          break;
        }

        default: {
          // Check registry for dynamically registered toolsets
          let factory = ToolsetRegistry.get(toolsetName);

          // If not in registry, try to dynamically import the toolset module
          // This enables lazy loading - only import toolsets that are actually used
          if (!factory) {
            try {
              // Attempt to import the toolset module (triggers self-registration)
              await import(`../tools/${toolsetName}/index.js`);
              factory = ToolsetRegistry.get(toolsetName);
            } catch {
              // Module doesn't exist, will fall through to error below
            }
          }

          if (factory) {
            const registeredTools = await factory({
              sandbox: this.sandbox,
              approvalController: this.approvalController,
              workerFilePath: this.options.workerFilePath,
              programRoot: this.options.programRoot,
              config: (toolsetConfig as Record<string, unknown>) || {},
            });
            for (const tool of registeredTools) {
              this.tools[tool.name] = tool;
            }
            break;
          }

          throw new Error(
            `Unknown toolset "${toolsetName}" in worker "${this.worker.name}". ` +
            `Valid toolsets: filesystem, workers, custom` +
            (ToolsetRegistry.list().length > 0 ? `, ${ToolsetRegistry.list().join(', ')}` : '')
          );
        }
      }
    }
  }

  /**
   * Execute the worker with the given input.
   * Uses AI SDK's native needsApproval for tool approval.
   * @param input - Text string or object with content and optional attachments
   */
  async run(input: RunInput): Promise<WorkerResult> {
    if (!this.initialized) {
      throw new Error(
        "WorkerRuntime.run() called before initialize(). " +
        "Use createWorkerRuntime() or call initialize() first."
      );
    }

    const maxIterations = this.options.maxIterations || 10;
    let toolCallCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let currentIteration = 0;
    const startTime = Date.now();

    // Emit execution start event
    this.emit({
      type: "execution_start",
      workerName: this.worker.name,
      model: this.resolvedModelId,
    });

    // Emit UI worker update event
    if (this.runtimeUI) {
      this.runtimeUI.updateWorker(
        this.workerId,
        this.worker.name,
        'running',
        undefined,
        this.depth
      );
    }

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
        // Check for interruption at the start of each iteration (before counting it)
        if (this.options.interruptSignal?.interrupted) {
          this.emit({
            type: "execution_end",
            success: true,
            response: "[Interrupted]",
            totalIterations: iteration,  // Report actual completed iterations
            totalToolCalls: toolCallCount,
            totalTokens: { input: totalInputTokens, output: totalOutputTokens },
            durationMs: Date.now() - startTime,
          });
          return {
            success: true,
            response: "[Interrupted]",
            toolCallCount,
            tokens: { input: totalInputTokens, output: totalOutputTokens },
          };
        }

        currentIteration = iteration + 1;
        const iterationNum = currentIteration;

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
            input: result.usage.inputTokens ?? 0,
            output: result.usage.outputTokens ?? 0,
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

          // Emit UI events for completion
          if (this.runtimeUI) {
            // Show the assistant's response
            if (response) {
              this.runtimeUI.showMessage({ role: 'assistant', content: response });
            }
            // Update worker status to complete
            this.runtimeUI.updateWorker(
              this.workerId,
              this.worker.name,
              'complete',
              undefined,
              this.depth
            );
            // Signal session end (only for root worker)
            if (this.depth === 0) {
              this.runtimeUI.endSession('completed');
            }
          }

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

        // Execute tools via ToolExecutor
        const executorCalls: ToolExecutorCall[] = toolCalls.map(tc => ({
          toolCallId: tc.toolCallId,
          toolName: tc.toolName,
          toolArgs: getToolArgs(tc),
        }));

        // Increment count BEFORE execution so failures don't underreport
        toolCallCount += executorCalls.length;

        const executionResults = await this.toolExecutor!.executeBatch(executorCalls, {
          messages,
          iteration: iterationNum,
        });

        // Convert results to tool-result messages
        const toolResultMessages = executionResults.map(result => ({
          type: "tool-result" as const,
          toolCallId: result.toolCallId,
          toolName: result.toolName,
          // AI SDK v6 requires output to be wrapped in { type: "json", value: ... }
          output: { type: "json", value: result.output },
        }));

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

      // Emit UI error events
      if (this.runtimeUI) {
        this.runtimeUI.showStatus('error', maxIterError);
        this.runtimeUI.updateWorker(this.workerId, this.worker.name, 'error', undefined, this.depth);
        if (this.depth === 0) {
          this.runtimeUI.endSession('error', maxIterError);
        }
      }

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
        totalIterations: currentIteration,
        totalToolCalls: toolCallCount,
        durationMs: Date.now() - startTime,
      });

      // Emit UI error events
      if (this.runtimeUI) {
        this.runtimeUI.showStatus('error', errorMsg);
        this.runtimeUI.updateWorker(this.workerId, this.worker.name, 'error', undefined, this.depth);
        if (this.depth === 0) {
          this.runtimeUI.endSession('error', errorMsg);
        }
      }

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
  getSandbox(): FileOperations | undefined {
    return this.sandbox;
  }

  /**
   * Get the approval controller.
   */
  getApprovalController(): ApprovalController {
    return this.approvalController;
  }

  /**
   * Get the worker depth in the delegation tree.
   * 0 = root worker, 1+ = child workers
   */
  getDepth(): number {
    return this.depth;
  }

  /**
   * Check if this is the root worker.
   */
  isRoot(): boolean {
    return this.depth === 0;
  }

  /**
   * Clean up resources.
   * Unsubscribes from UI events and releases resources.
   */
  async dispose(): Promise<void> {
    // Clean up UI subscriptions
    this.cleanupUISubscriptions();

    // Sandbox files persist intentionally
    // and MemoryBackend is garbage collected.
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

/**
 * Default factory for creating WorkerRunner instances.
 * Uses WorkerRuntime as the implementation.
 */
export const defaultWorkerRunnerFactory: WorkerRunnerFactory = {
  create(options: WorkerRunnerOptions): WorkerRunner {
    return new WorkerRuntime(options);
  },
};
