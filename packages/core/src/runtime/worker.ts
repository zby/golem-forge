/**
 * Worker Execution Runtime
 *
 * Core implementation for executing workers with tool support and approval checking.
 * This is the platform-agnostic runtime that both CLI and browser can use.
 *
 * NOTE: This file contains the WorkerRuntime class which requires tools to be
 * injected by the platform. The CLI and Chrome packages provide their own
 * factory functions that inject platform-specific tools (filesystem, shell, etc.).
 */

import { generateText, type ModelMessage, type Tool, type LanguageModel } from "ai";
import { type WorkerDefinition, workerNeedsSandbox } from "../worker-schema.js";
import type { FileOperations } from "../sandbox-types.js";
import type { RuntimeUI } from "../runtime-ui.js";
import { ApprovalController } from "../approval/index.js";
import { ToolExecutor } from "./tool-executor.js";
import { getLLMTools } from "../tools/tool-info.js";
import type { NamedTool } from "../tools/base.js";
import type { RuntimeEventCallback, RuntimeEventData } from "./events.js";
import { parseModelId, createModelWithOptions } from "./model-factory.js";
import type {
  WorkerResult,
  RunInput,
  WorkerRunner,
  WorkerRunnerOptions,
  WorkerRunnerFactory,
  ToolCall,
  Attachment,
  BinaryData,
} from "./types.js";

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
 * Compute the byte size of binary data in a cross-platform way.
 */
function getBinarySize(data: BinaryData): number {
  if (typeof data === "string") {
    return new TextEncoder().encode(data).byteLength;
  }

  if (data instanceof ArrayBuffer) {
    return data.byteLength;
  }

  if (ArrayBuffer.isView(data)) {
    return data.byteLength;
  }

  return 0;
}

/**
 * Get normalized extension (lowercase, includes leading dot) from an attachment name.
 */
function getAttachmentExtension(name: string | undefined): string {
  if (!name) return "";
  const normalized = name.replace(/\\/g, "/");
  const baseName = normalized.split("/").pop() ?? name;
  const lastDot = baseName.lastIndexOf(".");
  if (lastDot === -1 || lastDot === baseName.length - 1) {
    return "";
  }
  return baseName.slice(lastDot).toLowerCase();
}

/**
 * Enforce attachment policy defined on the worker.
 * Throws an error when the policy is violated.
 */
function enforceAttachmentPolicy(worker: WorkerDefinition, attachments: Attachment[]): void {
  const policy = worker.attachment_policy;
  if (!policy || attachments.length === 0) return;

  if (attachments.length > policy.max_attachments) {
    throw new Error(
      `Attachment policy violation: up to ${policy.max_attachments} attachment(s) allowed but ${attachments.length} provided.`
    );
  }

  const totalBytes = attachments.reduce((sum, attachment) => {
    return sum + getBinarySize(attachment.data);
  }, 0);

  if (totalBytes > policy.max_total_bytes) {
    throw new Error(
      `Attachment policy violation: total size ${totalBytes} bytes exceeds limit of ${policy.max_total_bytes} bytes.`
    );
  }

  const allowed = policy.allowed_suffixes.map((s) => s.toLowerCase());
  const denied = policy.denied_suffixes.map((s) => s.toLowerCase());

  for (const attachment of attachments) {
    const name = attachment.name || "attachment";
    const ext = getAttachmentExtension(name);

    if (allowed.length > 0 && (ext === "" || !allowed.includes(ext))) {
      throw new Error(
        `Attachment policy violation: ${name} (${ext || "no extension"}) not in allowed list: ${allowed.join(", ")}`
      );
    }

    if (denied.length > 0 && ext && denied.includes(ext)) {
      throw new Error(`Attachment policy violation: ${name} extension ${ext} is denied.`);
    }
  }
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
 * Synchronously create a language model using environment variables.
 * Uses the centralized createModelWithOptions from model-factory.ts.
 *
 * This function reads API keys from environment variables:
 * - ANTHROPIC_API_KEY for Anthropic
 * - OPENAI_API_KEY for OpenAI
 * - GOOGLE_GENERATIVE_AI_API_KEY for Google
 * - OPENROUTER_API_KEY for OpenRouter
 *
 * For async API key resolution (e.g., from browser storage), use
 * options.modelFactory or options.injectedModel instead.
 */
function createModelFromEnv(modelId: string): LanguageModel {
  const { provider } = parseModelId(modelId);

  // Get API key from environment - maps provider to env var name
  const envVarMap: Record<string, string | undefined> = {
    anthropic: process.env.ANTHROPIC_API_KEY,
    openai: process.env.OPENAI_API_KEY,
    google: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
  };

  const apiKey = envVarMap[provider];
  if (!apiKey) {
    throw new Error(
      `No API key configured for ${provider}. ` +
      `Set the appropriate environment variable (e.g., ANTHROPIC_API_KEY).`
    );
  }

  return createModelWithOptions(modelId, { apiKey });
}

/**
 * Extended options for WorkerRuntime that includes injected tools.
 * Tools are injected by platform-specific factories (CLI, Chrome).
 */
export interface WorkerRuntimeOptionsWithTools extends WorkerRunnerOptions {
  /** Pre-created tools to use (injected by platform) */
  tools?: Record<string, Tool>;
  /** Pre-created sandbox (injected by platform) */
  sandbox?: FileOperations;
}

/**
 * Runtime for executing workers.
 * Uses AI SDK's native needsApproval for tool approval.
 * Implements WorkerRunner interface for dependency inversion.
 *
 * NOTE: Tools must be injected via options.tools. This allows platforms
 * (CLI, Chrome) to provide their own toolsets (filesystem, shell, git, OPFS, etc.).
 */
export class WorkerRuntime implements WorkerRunner {
  private worker: WorkerDefinition;
  private options: WorkerRuntimeOptionsWithTools;
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

  constructor(options: WorkerRuntimeOptionsWithTools) {
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
      this.model = createModelFromEnv(this.resolvedModelId);
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

    // Use injected sandbox if provided
    this.sandbox = options.sandbox;

    // Validate sandbox requirements - worker config vs runtime config mismatch
    if (workerNeedsSandbox(this.worker) && !this.sandbox) {
      throw new Error(
        `Worker "${this.worker.name}" requires sandbox (declares filesystem/git toolset or sandbox restrictions), ` +
        `but no sandbox is configured. Add a sandbox section to the program config.`
      );
    }

    // Use injected tools if provided
    if (options.tools) {
      this.tools = { ...options.tools };
    }

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
   * Initialize the runtime.
   * If tools were injected, uses those. Otherwise expects platform to inject them.
   */
  async initialize(): Promise<void> {
    // Create tool executor with registered tools
    this.toolExecutor = new ToolExecutor({
      tools: this.tools,
      approvalController: this.approvalController,
      onEvent: this.onEvent,
      runtimeUI: this.runtimeUI,
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
   * Execute the worker with the given input.
   * Uses AI SDK's native needsApproval for tool approval.
   * @param input - Text string or object with content and optional attachments
   */
  async run(input: RunInput): Promise<WorkerResult> {
    if (!this.initialized) {
      throw new Error(
        "WorkerRuntime.run() called before initialize(). " +
        "Call initialize() first."
      );
    }

    // Fail early on empty input unless explicitly allowed.
    if (!this.worker.allow_empty_input && this.isEmptyRunInput(input)) {
      return {
        success: false,
        error:
          `No input provided for worker "${this.worker.name}". ` +
          `Provide a task prompt or attachments, or set allow_empty_input: true in front matter.`,
        toolCallCount: 0,
      };
    }

    const maxIterations = this.options.maxIterations || 10;
    const isChatMode = this.worker.mode === 'chat';
    const maxContextTokens = this.worker.max_context_tokens;
    let toolCallCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let currentIteration = 0;
    let lastResponse = "";
    const startTime = Date.now();

    // Emit execution start event
    this.emit({
      type: "execution_start",
      workerName: this.worker.name,
      model: this.resolvedModelId,
    });

    // Emit UI worker update event with model and tools info
    if (this.runtimeUI) {
      const toolNames = Object.keys(this.tools).sort();
      this.runtimeUI.updateWorker(
        this.workerId,
        this.worker.name,
        'running',
        undefined,
        this.depth,
        this.resolvedModelId,
        toolNames
      );
    }

    try {
      // Build initial messages
      const messages: ModelMessage[] = [
        { role: "system", content: this.worker.instructions },
      ];

      // Add user message with optional attachments
      this.addUserMessage(messages, input);

      // Filter to only LLM-invokable tools (excludes manual-only tools)
      // Tools without manualExecution config are treated as LLM tools (default)
      const llmTools = getLLMTools(this.tools as Record<string, NamedTool>);
      const hasTools = Object.keys(llmTools).length > 0;

      // Chat loop - runs once for single mode, repeatedly for chat mode
      chatLoop: while (true) {
        // Tool loop - handles LLM + tool calls until turn is complete
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
          // Note: llmTools is filtered to exclude manual-only tools
          const result = await generateText({
            model: this.model,
            messages,
            tools: hasTools ? llmTools : undefined,
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
            // No tool calls - turn complete
            lastResponse = result.text || "";

            // Add assistant response to messages for chat history
            if (lastResponse) {
              messages.push({ role: "assistant", content: lastResponse });
            }

            // Show the assistant's response in UI
            if (this.runtimeUI && lastResponse) {
              this.runtimeUI.showMessage({ role: 'assistant', content: lastResponse });
            }

            // For single mode, we're done
            if (!isChatMode) {
              this.emit({
                type: "execution_end",
                success: true,
                response: lastResponse,
                totalIterations: iterationNum,
                totalToolCalls: toolCallCount,
                totalTokens: { input: totalInputTokens, output: totalOutputTokens },
                durationMs: Date.now() - startTime,
              });

              // Emit UI events for completion
              if (this.runtimeUI) {
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
                response: lastResponse,
                toolCallCount,
                tokens: { input: totalInputTokens, output: totalOutputTokens },
              };
            }

            // Chat mode: emit context usage and get next user input
            const totalTokens = totalInputTokens + totalOutputTokens;
            if (this.runtimeUI) {
              this.runtimeUI.updateContextUsage(totalTokens, maxContextTokens);

              // Warn if context limit exceeded
              if (totalTokens > maxContextTokens) {
                this.runtimeUI.showStatus(
                  'warning',
                  `Context limit exceeded (${totalTokens}/${maxContextTokens} tokens). Use /new to start fresh.`
                );
              }
            }

            // Get next user input
            if (!this.runtimeUI) {
              // No UI available for chat mode - this shouldn't happen
              throw new Error("Chat mode requires RuntimeUI for user input");
            }

            const userInput = await this.runtimeUI.getUserInput('> ');
            const trimmedInput = userInput.trim();

            // Handle commands
            if (trimmedInput === '/exit') {
              // Exit chat loop
              this.emit({
                type: "execution_end",
                success: true,
                response: lastResponse,
                totalIterations: iterationNum,
                totalToolCalls: toolCallCount,
                totalTokens: { input: totalInputTokens, output: totalOutputTokens },
                durationMs: Date.now() - startTime,
              });

              if (this.runtimeUI) {
                this.runtimeUI.updateWorker(
                  this.workerId,
                  this.worker.name,
                  'complete',
                  undefined,
                  this.depth
                );
                if (this.depth === 0) {
                  this.runtimeUI.endSession('completed');
                }
              }

              return {
                success: true,
                response: lastResponse,
                toolCallCount,
                tokens: { input: totalInputTokens, output: totalOutputTokens },
              };
            }

            if (trimmedInput === '/new') {
              // Reset conversation - keep only system message
              messages.length = 1;
              totalInputTokens = 0;
              totalOutputTokens = 0;
              if (this.runtimeUI) {
                this.runtimeUI.showStatus('info', 'Conversation reset. Starting fresh.');
                this.runtimeUI.updateContextUsage(0, maxContextTokens);
              }
              // Wait for new user input
              const newUserInput = await this.runtimeUI.getUserInput('> ');
              if (newUserInput.trim() === '/exit') {
                this.emit({
                  type: "execution_end",
                  success: true,
                  response: "",
                  totalIterations: iterationNum,
                  totalToolCalls: toolCallCount,
                  totalTokens: { input: 0, output: 0 },
                  durationMs: Date.now() - startTime,
                });
                if (this.runtimeUI) {
                  this.runtimeUI.updateWorker(
                    this.workerId,
                    this.worker.name,
                    'complete',
                    undefined,
                    this.depth
                  );
                  if (this.depth === 0) {
                    this.runtimeUI.endSession('completed');
                  }
                }
                return {
                  success: true,
                  response: "",
                  toolCallCount,
                  tokens: { input: 0, output: 0 },
                };
              }
              messages.push({ role: "user", content: newUserInput });
              continue chatLoop;
            }

            // Regular user input - add to messages and continue
            messages.push({ role: "user", content: trimmedInput });
            continue chatLoop;
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
          const executorCalls: ToolCall[] = toolCalls.map(tc => ({
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

        // Hit max iterations within a turn
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
      }
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
   * Add a user message to the messages array.
   * Handles both string input and structured input with attachments.
   */
  private addUserMessage(messages: ModelMessage[], input: RunInput): void {
    if (typeof input === "string") {
      messages.push({ role: "user", content: input });
    } else {
      const attachments = input.attachments ?? [];
      if (attachments.length > 0) {
        enforceAttachmentPolicy(this.worker, attachments);
      }

      // Build user content with attachments
      const userContent: Array<
        { type: "text"; text: string } | { type: "file"; data: ArrayBuffer | Uint8Array | string; mediaType: string }
      > = [{ type: "text", text: input.content }];

      for (const att of attachments) {
        userContent.push({
          type: "file",
          data: att.data,
          mediaType: att.mimeType,
        });
      }

      messages.push({ role: "user", content: userContent });
    }
  }

  /**
   * Check whether a RunInput carries no meaningful text or attachments.
   */
  private isEmptyRunInput(input: RunInput): boolean {
    if (typeof input === "string") {
      return input.trim().length === 0;
    }

    const hasText = input.content.trim().length > 0;
    const hasAttachments = (input.attachments?.length ?? 0) > 0;
    return !hasText && !hasAttachments;
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
 * Create and initialize a worker runtime with injected tools.
 */
export async function createWorkerRuntime(options: WorkerRuntimeOptionsWithTools): Promise<WorkerRuntime> {
  const runtime = new WorkerRuntime(options);
  await runtime.initialize();
  return runtime;
}

/**
 * Default factory for creating WorkerRunner instances.
 * Uses WorkerRuntime as the implementation.
 * Note: This requires tools to be injected in options.
 */
export const defaultWorkerRunnerFactory: WorkerRunnerFactory = {
  create(options: WorkerRunnerOptions): WorkerRunner {
    return new WorkerRuntime(options as WorkerRuntimeOptionsWithTools);
  },
};
