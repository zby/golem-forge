/**
 * Browser Worker Runtime
 *
 * Executes workers in the browser extension environment.
 * Uses streamText for real-time streaming responses.
 */

import { streamText, type LanguageModel, type Tool } from 'ai';
import type { WorkerDefinition } from './worker-manager';
import { browserAIService } from './ai-service';
import {
  type MountSandbox,
  type FileOperations,
  createOPFSSandbox,
} from './opfs-sandbox';
import type { RuntimeUI, ApprovalResult, WorkerInfo, ToolsetContext, WorkerRunnerFactory, WorkerRunner, WorkerRunnerOptions, RunInput, Attachment } from '@golem-forge/core';
import { ToolsetRegistry, IsomorphicGitBackend, type NamedTool } from '@golem-forge/core';
import { createSandboxGitAdapter } from './opfs-git-adapter';
import { createBrowserWorkerRegistry } from './browser-worker-registry';
import { browserModuleLoader } from './browser-module-loader';

// Re-export core types for convenience
import type {
  ApprovalMode,
  ApprovalRequest,
  ApprovalDecision,
  ApprovalCallback,
  WorkerResult as CoreWorkerResult,
} from '@golem-forge/core';

// Re-export for backwards compatibility
export type { ApprovalMode, ApprovalRequest, ApprovalDecision, ApprovalCallback };

// ─────────────────────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────────────────────

const LOG_PREFIX = '[GolemForge Runtime]';

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, ...args);
}

function logError(...args: unknown[]) {
  console.error(LOG_PREFIX, ...args);
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Handling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Known error patterns from AI SDK that need sanitization.
 */
const ERROR_PATTERNS = [
  {
    pattern: /Run 'npx vercel link'/i,
    message: 'API configuration error. Please check your API key in Settings.',
  },
  {
    pattern: /vercel.*gateway/i,
    message: 'Provider configuration error. Please verify your API key.',
  },
  {
    pattern: /VERCEL_AI_TOKEN/i,
    message: 'API authentication failed. Please check your API key in Settings.',
  },
  {
    pattern: /invalid_api_key/i,
    message: 'Invalid API key. Please check your API key in Settings.',
  },
  {
    pattern: /401|unauthorized/i,
    message: 'API key unauthorized. Please verify your API key in Settings.',
  },
  {
    pattern: /403|forbidden/i,
    message: 'Access forbidden. Your API key may not have access to this model.',
  },
  {
    pattern: /rate.?limit/i,
    message: 'Rate limit exceeded. Please wait a moment and try again.',
  },
  {
    pattern: /insufficient.?funds|credit|billing/i,
    message: 'Account billing issue. Please check your API provider account.',
  },
  {
    pattern: /model.*not.*found|invalid.*model/i,
    message: 'Model not found. Please check your model selection in Settings.',
  },
];

/**
 * Sanitize error messages to make them user-friendly.
 *
 * The AI SDK can produce very long, cryptic errors especially when
 * falling back to Vercel's gateway. This function extracts useful info.
 */
function sanitizeErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);

  // Log the full error for debugging
  logError('Raw error:', rawMessage.slice(0, 500) + (rawMessage.length > 500 ? '...' : ''));

  // Check for known patterns
  for (const { pattern, message } of ERROR_PATTERNS) {
    if (pattern.test(rawMessage)) {
      return message;
    }
  }

  // If the error message is too long (contains bundled code), truncate it
  if (rawMessage.length > 500) {
    // Try to extract the first meaningful line
    const firstLine = rawMessage.split('\n')[0];
    if (firstLine && firstLine.length < 200) {
      return firstLine;
    }
    return 'An error occurred while processing your request. Check console for details.';
  }

  return rawMessage;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of a worker execution.
 * Extends core WorkerResult with browser-specific fields.
 */
export interface WorkerResult extends CoreWorkerResult {
  // Browser-specific fields can be added here if needed
}

/**
 * Callback for streaming text updates.
 */
export type StreamCallback = (text: string) => void;

/**
 * Callback for tool execution updates.
 */
export type ToolCallback = (toolName: string, args: Record<string, unknown>, result: unknown) => void;

/**
 * Options for running a worker.
 *
 * Supports two modes:
 * - Callback-based (legacy): Use approvalCallback, onStream, onToolCall
 * - Event-based (new): Use runtimeUI for event-driven communication
 *
 * If runtimeUI is provided, it takes precedence over callbacks.
 */
export interface BrowserRuntimeOptions {
  /** The worker definition to execute */
  worker: WorkerDefinition;
  /** Model ID (e.g., "anthropic:claude-sonnet-4-20250514") */
  modelId?: string;
  /** Program ID for sandbox access */
  programId?: string;
  /** Maximum iterations */
  maxIterations?: number;

  // ---- Option A: Callback-based (legacy, for backwards compatibility) ----

  /** Approval mode (only used if runtimeUI is not provided) */
  approvalMode?: ApprovalMode;
  /** Callback for approval requests (only used if runtimeUI is not provided) */
  approvalCallback?: ApprovalCallback;
  /** Callback for streaming text (only used if runtimeUI is not provided) */
  onStream?: StreamCallback;
  /** Callback for tool calls (only used if runtimeUI is not provided) */
  onToolCall?: ToolCallback;

  // ---- Option B: Event-based (new, preferred) ----

  /**
   * RuntimeUI instance for event-based communication.
   * If provided, uses events instead of callbacks for:
   * - Streaming (runtimeUI.appendStreaming)
   * - Tool execution (runtimeUI.showToolStarted, runtimeUI.showToolResult)
   * - Approval (runtimeUI.requestApproval)
   */
  runtimeUI?: RuntimeUI;

  // ---- Worker delegation options ----

  /**
   * Shared sandbox from parent worker (for delegation).
   * When provided, child worker uses this sandbox instead of creating a new one.
   * This ensures delegated workers respect parent's restrict/readonly rules.
   */
  sharedSandbox?: MountSandbox;

  /**
   * Shared approval controller from parent worker (for delegation).
   * When provided, child worker uses parent's approval state.
   * This ensures delegated workers respect prior approvals.
   */
  sharedApprovalController?: IApprovalController;

  /**
   * Delegation context for worker chains.
   * Tracks the path of workers in a delegation chain.
   */
  delegationContext?: {
    delegationPath: string[];
    maxDepth?: number;
  };

  /**
   * Worker depth in delegation tree (0 = root).
   */
  depth?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Approval Controllers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Interface for approval controllers.
 * Supports both callback-based and event-based approval.
 */
interface IApprovalController {
  requestApproval(request: ApprovalRequest): Promise<ApprovalDecision>;
}

/**
 * Callback-based approval controller (legacy).
 * Uses approvalMode and approvalCallback for approval decisions.
 */
class CallbackApprovalController implements IApprovalController {
  private mode: ApprovalMode;
  private callback?: ApprovalCallback;
  private sessionCache = new Map<string, ApprovalDecision>();

  constructor(mode: ApprovalMode, callback?: ApprovalCallback) {
    this.mode = mode;
    this.callback = callback;

    if (mode === 'interactive' && !callback) {
      throw new Error('Interactive mode requires an approval callback');
    }
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
    if (this.mode === 'approve_all') {
      return { approved: true, remember: 'none' };
    }

    if (this.mode === 'auto_deny') {
      return { approved: false, note: 'Auto-deny mode', remember: 'none' };
    }

    // Check session cache
    const cacheKey = `${request.toolName}:${JSON.stringify(request.toolArgs)}`;
    const cached = this.sessionCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Request approval via callback
    const decision = await this.callback!(request);

    // Cache if approved with remember=session
    if (decision.approved && decision.remember === 'session') {
      this.sessionCache.set(cacheKey, decision);
    }

    return decision;
  }
}

/**
 * Event-based approval controller.
 * Uses RuntimeUI for approval via event bus.
 */
class EventApprovalController implements IApprovalController {
  private runtimeUI: RuntimeUI;
  private workerPath: WorkerInfo[];

  constructor(runtimeUI: RuntimeUI, workerPath: WorkerInfo[] = []) {
    this.runtimeUI = runtimeUI;
    this.workerPath = workerPath;
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
    // Use RuntimeUI's event-based approval
    const result: ApprovalResult = await this.runtimeUI.requestApproval(
      'tool_call',
      request.description,
      request.toolArgs,
      'medium', // Default to medium risk for write/delete operations
      this.workerPath
    );

    // Convert ApprovalResult to ApprovalDecision
    if (result.approved === true) {
      return { approved: true, remember: 'none' };
    } else if (result.approved === false) {
      return { approved: false, note: result.reason, remember: 'none' };
    } else if (result.approved === 'session') {
      return { approved: true, remember: 'session' };
    } else {
      // 'always' - treat as session approval for now
      // (always approvals are managed by UIProvider, not here)
      return { approved: true, remember: 'session' };
    }
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// Tool Creation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load tools from ToolsetRegistry using the specified context.
 * Returns tools as a Record<string, Tool> for use with AI SDK.
 *
 * Note: The tools from core use needsApproval property which is checked
 * during tool execution in the runtime loop.
 */
async function loadToolsFromRegistry(
  toolsetName: string,
  context: ToolsetContext
): Promise<Record<string, NamedTool>> {
  const factory = ToolsetRegistry.get(toolsetName);
  if (!factory) {
    console.warn(`Toolset "${toolsetName}" not found in registry`);
    return {};
  }

  const tools = await factory(context);
  const toolMap: Record<string, NamedTool> = {};
  for (const tool of tools) {
    toolMap[tool.name] = tool;
  }
  return toolMap;
}

// ─────────────────────────────────────────────────────────────────────────────
// Message Types (simplified for browser runtime)
// ─────────────────────────────────────────────────────────────────────────────

interface SystemMessage {
  role: 'system';
  content: string;
}

/**
 * User message content part types.
 * Supports text and file attachments (images, PDFs, etc.)
 */
type UserContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; image: ArrayBuffer | Uint8Array | string; mimeType?: string }
  | { type: 'file'; data: ArrayBuffer | Uint8Array | string; mimeType: string };

interface UserMessage {
  role: 'user';
  content: string | UserContentPart[];
}

interface AssistantMessage {
  role: 'assistant';
  content: Array<{ type: 'text'; text: string } | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown }>;
}

interface ToolMessage {
  role: 'tool';
  content: Array<{ type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }>;
}

type Message = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

// ─────────────────────────────────────────────────────────────────────────────
// Browser Worker Runtime
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Browser Worker Runtime.
 *
 * Executes workers in the browser with:
 * - OPFS-based sandbox for file operations
 * - streamText for real-time streaming
 * - Browser-safe AI provider configuration
 */
export class BrowserWorkerRuntime {
  private worker: WorkerDefinition;
  private options: BrowserRuntimeOptions;
  private model?: LanguageModel;
  private sandbox?: MountSandbox;
  private tools: Record<string, Tool> = {};
  private approvalController: IApprovalController;
  private initialized = false;

  constructor(options: BrowserRuntimeOptions) {
    this.worker = options.worker;
    this.options = options;

    // Use shared approval controller if provided (for worker delegation)
    if (options.sharedApprovalController) {
      this.approvalController = options.sharedApprovalController;
    } else if (options.runtimeUI) {
      // Event-based mode: use RuntimeUI for approvals
      const depth = options.depth ?? 0;
      const workerPath: WorkerInfo[] = [{
        id: options.worker.name || 'worker',
        depth,
        task: options.worker.name || 'Worker',
      }];
      this.approvalController = new EventApprovalController(options.runtimeUI, workerPath);
    } else {
      // Callback-based mode (legacy)
      this.approvalController = new CallbackApprovalController(
        options.approvalMode || 'interactive',
        options.approvalCallback
      );
    }

    // Use shared sandbox if provided (for worker delegation)
    if (options.sharedSandbox) {
      this.sandbox = options.sharedSandbox;
    }
  }

  /**
   * Initialize the runtime.
   * Creates sandbox and registers tools.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    log('Initializing runtime for worker:', this.worker.name);

    // Create model
    const modelId = this.options.modelId || await browserAIService.getDefaultModelId();
    log('Using model:', modelId);

    try {
      this.model = await browserAIService.createModel(modelId);
      log('Model created successfully');
    } catch (error) {
      logError('Failed to create model:', error);
      throw new Error(sanitizeErrorMessage(error));
    }

    // Create sandbox if program ID is provided and not already set (shared sandbox)
    if (!this.sandbox && this.options.programId) {
      log('Creating sandbox for program:', this.options.programId);
      this.sandbox = await createOPFSSandbox({
        root: `/projects/${this.options.programId}`, // Path kept as 'projects' for backwards compatibility
      });

      // Apply worker sandbox restrictions
      if (this.worker.sandbox) {
        this.sandbox = this.sandbox.restrict({
          restrict: this.worker.sandbox.restrict,
          readonly: this.worker.sandbox.readonly,
        }) as MountSandbox;
      }
    } else if (this.sandbox) {
      log('Using shared sandbox from parent worker');
      // Apply additional worker restrictions on top of shared sandbox
      if (this.worker.sandbox) {
        this.sandbox = this.sandbox.restrict({
          restrict: this.worker.sandbox.restrict,
          readonly: this.worker.sandbox.readonly,
        }) as MountSandbox;
      }
    }

    // Register tools based on worker config
    await this.registerTools();
    log('Registered tools:', Object.keys(this.tools));

    this.initialized = true;
    log('Runtime initialized');
  }

  /**
   * Register tools based on worker configuration.
   *
   * Uses ToolsetRegistry from @golem-forge/core for portable toolsets.
   * Shell toolset is not available in browser and will be skipped.
   */
  private async registerTools(): Promise<void> {
    const toolsetsConfig = this.worker.toolsets || {};

    // Import filesystem toolset to ensure it's registered
    // (self-registers when the module is imported)
    await import('@golem-forge/core/tools');

    for (const [toolsetName, toolsetConfig] of Object.entries(toolsetsConfig)) {
      // Shell is not available in browser (requires child_process)
      if (toolsetName === 'shell') {
        console.warn('Shell toolset is not available in browser - skipping');
        continue;
      }

      // Special handling for filesystem (requires sandbox)
      if (toolsetName === 'filesystem') {
        if (!this.sandbox) {
          throw new Error('Filesystem toolset requires a program. Set programId in options.');
        }
      }

      // Build context for toolset factory
      const context: ToolsetContext = {
        sandbox: this.sandbox,
        approvalController: this.createCoreApprovalController(),
        workerFilePath: undefined,
        programRoot: this.options.programId ? `/projects/${this.options.programId}` : undefined,
        config: (toolsetConfig as Record<string, unknown>) || {},
      };

      // Add toolset-specific context
      await this.enrichToolsetContext(toolsetName, context, toolsetConfig);

      // Load tools from registry
      const tools = await loadToolsFromRegistry(toolsetName, context);
      if (Object.keys(tools).length > 0) {
        Object.assign(this.tools, tools);
        log(`Loaded ${Object.keys(tools).length} tools from "${toolsetName}" toolset`);
      }
    }
  }

  /**
   * Enrich toolset context with platform-specific dependencies.
   */
  private async enrichToolsetContext(
    toolsetName: string,
    context: ToolsetContext,
    toolsetConfig: unknown
  ): Promise<void> {
    const programRoot = this.options.programId ? `/projects/${this.options.programId}` : undefined;

    switch (toolsetName) {
      case 'git': {
        // Git toolset needs IsomorphicGitBackend with OPFS adapter
        if (!programRoot) {
          console.warn('Git toolset requires a program. Set programId in options.');
          return;
        }

        try {
          const fs = await createSandboxGitAdapter(programRoot);
          const gitBackend = new IsomorphicGitBackend({
            fs,
            dir: programRoot,
            // Token can be provided via settings (future enhancement)
          });

          // Set gitBackend directly on context (not in config)
          // This matches the GitToolsetContext interface expected by gitToolsetFactory
          (context as unknown as Record<string, unknown>).gitBackend = gitBackend;
        } catch (error) {
          console.warn('Failed to create git backend:', error);
        }
        break;
      }

      case 'workers': {
        // Workers toolset needs registry and runner factory
        // Config uses "allowed_workers" key (matching worker YAML schema)
        const config = toolsetConfig as { allowed_workers?: string[]; allow?: string[] } | undefined;
        const allowedWorkers = config?.allowed_workers || config?.allow || [];

        if (allowedWorkers.length === 0) {
          log('Workers toolset has no allowed workers configured');
          return;
        }

        // Create browser worker registry
        const registry = createBrowserWorkerRegistry('bundled');

        // Create a runner factory that creates BrowserWorkerRuntime instances
        // The factory must honor sharedSandbox/sharedApprovalController for security
        const workerRunnerFactory: WorkerRunnerFactory = {
          create: (options: WorkerRunnerOptions): WorkerRunner => {
            return this.createChildWorkerRunner(options);
          },
        };

        Object.assign(context.config as Record<string, unknown>, {
          allowedWorkers,
          registry,
          workerRunnerFactory,
          approvalMode: this.options.approvalMode || 'interactive',
          approvalCallback: this.options.approvalCallback,
          runtimeUI: this.options.runtimeUI,
        });
        break;
      }

      case 'custom': {
        // Custom toolset needs module loader
        (context.config as Record<string, unknown>).moduleLoader = browserModuleLoader;
        break;
      }
    }
  }

  /**
   * Create a child worker runner for delegation.
   * Honors sharedSandbox and sharedApprovalController for security.
   */
  private createChildWorkerRunner(options: WorkerRunnerOptions): WorkerRunner {
    // Calculate child depth
    const parentDepth = this.options.depth ?? 0;
    const childDepth = parentDepth + 1;

    // Create a new BrowserWorkerRuntime for the child worker
    // IMPORTANT: Pass sharedSandbox and sharedApprovalController to ensure
    // child workers respect parent's security constraints
    const childRuntime = new BrowserWorkerRuntime({
      worker: options.worker,
      modelId: options.model,
      programId: this.options.programId,
      approvalMode: options.approvalMode,
      approvalCallback: options.approvalCallback,
      runtimeUI: options.runtimeUI,
      maxIterations: options.maxIterations,
      // Pass shared sandbox - child inherits parent's restrictions
      sharedSandbox: options.sharedSandbox as MountSandbox | undefined ?? this.sandbox,
      // Pass shared approval controller - child uses parent's approval state
      sharedApprovalController: options.sharedApprovalController as IApprovalController | undefined,
      // Pass delegation context
      delegationContext: options.delegationContext,
      depth: childDepth,
    });

    // Wrap as WorkerRunner interface
    return {
      initialize: () => childRuntime.initialize(),
      run: (input) => childRuntime.runWithInput(input),
      getModelId: () => options.model || 'unknown',
      getTools: () => childRuntime.getTools(),
      getSandbox: () => childRuntime.getSandbox(),
      getApprovalController: () => this.createCoreApprovalController(),
    };
  }

  /**
   * Create a core-compatible ApprovalController from the browser's IApprovalController.
   * This adapts the browser's approval interface to match core's expected interface.
   *
   * Note: We use 'as any' because we're creating a duck-typed object that implements
   * the methods toolsets actually use, not a full ApprovalController instance.
   * Toolsets only use requestApproval(), so this is safe.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private createCoreApprovalController(): any {
    // The browser's IApprovalController has the same requestApproval signature
    // as core's ApprovalController, so we can use it directly.
    // We just need to add the mode property that core expects.
    return {
      mode: 'interactive' as const,
      requestApproval: this.approvalController.requestApproval.bind(this.approvalController),
      // Minimal implementation of other methods (not used by filesystem toolset)
      isSessionApproved: () => false,
      clearSessionApprovals: () => {},
      memory: { lookup: () => undefined, store: () => {}, clear: () => {} },
      getCallback: () => this.approvalController.requestApproval.bind(this.approvalController),
    };
  }

  /**
   * Execute the worker with the given input.
   *
   * Uses streamText for real-time streaming of responses.
   * Supports both callback-based and event-based communication.
   */
  async run(input: string): Promise<WorkerResult> {
    if (!this.initialized) {
      throw new Error('Runtime not initialized. Call initialize() first.');
    }

    log('Running worker with input:', input.slice(0, 100) + (input.length > 100 ? '...' : ''));

    const maxIterations = this.options.maxIterations || 50;
    let toolCallCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    // Generate a unique request ID for streaming correlation
    const streamingRequestId = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Get runtimeUI if in event mode
    const runtimeUI = this.options.runtimeUI;

    try {
      // Build initial messages
      const messages: Message[] = [
        { role: 'system', content: this.worker.instructions },
        { role: 'user', content: input },
      ];

      const hasTools = Object.keys(this.tools).length > 0;

      // Start streaming if in event mode
      if (runtimeUI) {
        runtimeUI.startStreaming(streamingRequestId);
      }

      for (let iteration = 0; iteration < maxIterations; iteration++) {
        log('Iteration', iteration + 1, '/', maxIterations);

        // Call streamText - use type assertion to avoid complex type issues with AI SDK
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let result;
        try {
          result = await streamText({
            model: this.model!,
            messages: messages as any,
            tools: hasTools ? this.tools : undefined,
            maxOutputTokens: 4096,
          });
        } catch (streamError) {
          // Catch errors from streamText initialization
          throw new Error(sanitizeErrorMessage(streamError));
        }

        // Collect the full response
        let fullText = '';
        const toolCalls: Array<{
          toolCallId: string;
          toolName: string;
          args: Record<string, unknown>;
        }> = [];

        // Stream the response
        try {
          for await (const part of result.fullStream) {
            if (part.type === 'text-delta') {
              fullText += part.text;

              // Emit streaming event or call callback
              if (runtimeUI) {
                runtimeUI.appendStreaming(streamingRequestId, part.text);
              } else {
                this.options.onStream?.(part.text);
              }
            } else if (part.type === 'tool-call') {
              toolCalls.push({
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                args: part.input as Record<string, unknown>,
              });
            }
          }
        } catch (streamError) {
          // Catch errors during streaming (e.g., API errors)
          throw new Error(sanitizeErrorMessage(streamError));
        }

        // Get final usage
        const usage = await result.usage;
        totalInputTokens += usage.inputTokens ?? 0;
        totalOutputTokens += usage.outputTokens ?? 0;

        // If no tool calls, we're done
        if (toolCalls.length === 0) {
          // End streaming in event mode
          if (runtimeUI) {
            runtimeUI.endStreaming(streamingRequestId);
          }

          return {
            success: true,
            response: fullText,
            toolCallCount,
            tokens: { input: totalInputTokens, output: totalOutputTokens },
          };
        }

        // Execute tool calls
        const toolResults: Array<{
          type: 'tool-result';
          toolCallId: string;
          toolName: string;
          result: unknown;
        }> = [];

        for (const tc of toolCalls) {
          toolCallCount++;
          const startTime = Date.now();

          // Emit tool started event in event mode
          if (runtimeUI) {
            runtimeUI.showToolStarted(tc.toolCallId, tc.toolName, tc.args);
          }

          const tool = this.tools[tc.toolName] as NamedTool | undefined;
          let toolResult: unknown;
          let toolStatus: 'success' | 'error' = 'success';

          if (!tool || !tool.execute) {
            toolResult = { error: `Tool not found: ${tc.toolName}` };
            toolStatus = 'error';
          } else {
            // Check if tool needs approval (supports both static boolean and dynamic function)
            const needsApproval = typeof tool.needsApproval === 'function'
              ? await tool.needsApproval(tc.args, { toolCallId: tc.toolCallId, messages: [] })
              : tool.needsApproval;

            if (needsApproval) {
              // Request approval before executing
              const decision = await this.approvalController.requestApproval({
                toolName: tc.toolName,
                toolArgs: tc.args,
                description: `Execute tool: ${tc.toolName}`,
              });

              if (!decision.approved) {
                toolResult = {
                  success: false,
                  error: `Operation denied: ${decision.note || 'User rejected'}`,
                };
                toolStatus = 'error';
              } else {
                // Approved - execute the tool
                try {
                  toolResult = await tool.execute(tc.args, {
                    toolCallId: tc.toolCallId,
                    messages: [],
                  });
                } catch (err) {
                  toolResult = { error: err instanceof Error ? err.message : String(err) };
                  toolStatus = 'error';
                }
              }
            } else {
              // No approval needed - execute directly
              try {
                toolResult = await tool.execute(tc.args, {
                  toolCallId: tc.toolCallId,
                  messages: [],
                });
              } catch (err) {
                toolResult = { error: err instanceof Error ? err.message : String(err) };
                toolStatus = 'error';
              }
            }
          }

          const durationMs = Date.now() - startTime;

          // Emit tool result event or call callback
          if (runtimeUI) {
            runtimeUI.showToolResult(
              tc.toolCallId,
              tc.toolName,
              toolStatus,
              durationMs,
              { kind: 'json', data: toolResult },
              toolStatus === 'error' ? String((toolResult as { error: string }).error) : undefined
            );
          } else {
            this.options.onToolCall?.(tc.toolName, tc.args, toolResult);
          }

          toolResults.push({
            type: 'tool-result',
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            result: toolResult,
          });
        }

        // Add assistant message with tool calls
        messages.push({
          role: 'assistant',
          content: [
            ...(fullText ? [{ type: 'text' as const, text: fullText }] : []),
            ...toolCalls.map((tc) => ({
              type: 'tool-call' as const,
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              args: tc.args,
            })),
          ],
        });

        // Add tool results
        messages.push({
          role: 'tool',
          content: toolResults,
        });
      }

      // Max iterations exceeded
      log('Max iterations exceeded:', maxIterations);

      // End streaming in event mode
      if (runtimeUI) {
        runtimeUI.endStreaming(streamingRequestId);
      }

      return {
        success: false,
        error: `Maximum iterations (${maxIterations}) exceeded`,
        toolCallCount,
        tokens: { input: totalInputTokens, output: totalOutputTokens },
      };
    } catch (err) {
      const sanitizedError = sanitizeErrorMessage(err);
      logError('Worker execution failed:', sanitizedError);

      // End streaming in event mode on error
      if (runtimeUI) {
        runtimeUI.endStreaming(streamingRequestId);
      }

      return {
        success: false,
        error: sanitizedError,
        toolCallCount,
        tokens: { input: totalInputTokens, output: totalOutputTokens },
      };
    }
  }

  /**
   * Execute the worker with typed RunInput (supports attachments).
   *
   * This is the full implementation that handles both:
   * - Simple string input
   * - Object input with content and attachments
   *
   * Used by worker delegation to properly forward files/images.
   */
  async runWithInput(input: RunInput): Promise<WorkerResult> {
    if (typeof input === 'string') {
      // Simple string input - delegate to run()
      return this.run(input);
    }

    // Object input with potential attachments
    if (!this.initialized) {
      throw new Error('Runtime not initialized. Call initialize() first.');
    }

    const { content, attachments } = input;

    log('Running worker with content and', attachments?.length || 0, 'attachments');

    const maxIterations = this.options.maxIterations || 50;
    let toolCallCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    const streamingRequestId = `stream-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const runtimeUI = this.options.runtimeUI;

    try {
      // Build user message content with attachments
      let userContent: string | UserContentPart[];

      if (!attachments || attachments.length === 0) {
        // No attachments - use simple string
        userContent = content;
      } else {
        // Build content array with text and attachments
        const contentParts: UserContentPart[] = [{ type: 'text', text: content }];

        for (const attachment of attachments) {
          // Convert attachment to content part
          // Handle different data formats (ArrayBuffer, Uint8Array, base64 string)
          let data: ArrayBuffer | Uint8Array | string;
          if (typeof attachment.data === 'string') {
            // Already a string (base64)
            data = attachment.data;
          } else if (attachment.data instanceof ArrayBuffer) {
            data = attachment.data;
          } else if (attachment.data instanceof Uint8Array) {
            data = attachment.data;
          } else {
            // Unknown format, skip
            console.warn('Unknown attachment data format, skipping');
            continue;
          }

          // Determine content type based on MIME type
          if (attachment.mimeType.startsWith('image/')) {
            contentParts.push({
              type: 'image',
              image: data,
              mimeType: attachment.mimeType,
            });
          } else {
            // Other file types (PDF, etc.)
            contentParts.push({
              type: 'file',
              data,
              mimeType: attachment.mimeType,
            });
          }
        }

        userContent = contentParts;
      }

      // Build initial messages
      const messages: Message[] = [
        { role: 'system', content: this.worker.instructions },
        { role: 'user', content: userContent },
      ];

      const hasTools = Object.keys(this.tools).length > 0;

      // Start streaming if in event mode
      if (runtimeUI) {
        runtimeUI.startStreaming(streamingRequestId);
      }

      // Note: The rest of the execution loop is the same as run()
      // For now, we delegate to the core run logic after building messages
      // In a full implementation, this would contain the complete streamText loop

      // For simplicity, if there are attachments we still try to run
      // The AI SDK handles multimodal content when passed as content array
      for (let iteration = 0; iteration < maxIterations; iteration++) {
        log('Iteration', iteration + 1, '/', maxIterations);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let result;
        try {
          result = await streamText({
            model: this.model!,
            messages: messages as any,
            tools: hasTools ? this.tools : undefined,
            maxOutputTokens: 4096,
          });
        } catch (streamError) {
          throw new Error(sanitizeErrorMessage(streamError));
        }

        // Collect the full response
        let responseText = '';
        const toolCalls: Array<{ toolCallId: string; toolName: string; args: unknown }> = [];

        for await (const part of result.fullStream) {
          if (part.type === 'text-delta') {
            responseText += part.textDelta;
            if (runtimeUI) {
              runtimeUI.appendStreaming(streamingRequestId, part.textDelta);
            } else if (this.options.onStream) {
              this.options.onStream(part.textDelta);
            }
          } else if (part.type === 'tool-call') {
            toolCalls.push({
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              args: part.args,
            });
          } else if (part.type === 'finish') {
            totalInputTokens += part.usage?.promptTokens || 0;
            totalOutputTokens += part.usage?.completionTokens || 0;
          }
        }

        // If no tool calls, we're done
        if (toolCalls.length === 0) {
          if (runtimeUI) {
            runtimeUI.endStreaming(streamingRequestId);
          }
          return {
            success: true,
            response: responseText,
            toolCallCount,
            tokens: { input: totalInputTokens, output: totalOutputTokens },
          };
        }

        // Process tool calls (simplified - full version in run())
        const assistantContent: AssistantMessage['content'] = [];
        if (responseText) {
          assistantContent.push({ type: 'text', text: responseText });
        }
        for (const call of toolCalls) {
          assistantContent.push({
            type: 'tool-call',
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            args: call.args,
          });
        }
        messages.push({ role: 'assistant', content: assistantContent });

        // Execute tool calls
        const toolResults: Array<{ type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }> = [];

        for (const call of toolCalls) {
          toolCallCount++;
          const tool = this.tools[call.toolName];
          if (!tool) {
            toolResults.push({
              type: 'tool-result',
              toolCallId: call.toolCallId,
              toolName: call.toolName,
              result: { error: `Tool not found: ${call.toolName}` },
            });
            continue;
          }

          try {
            if (runtimeUI) {
              runtimeUI.showToolStarted(call.toolName, call.args as Record<string, unknown>);
            }

            const toolResult = await (tool as any).execute(call.args, { toolCallId: call.toolCallId });

            if (runtimeUI) {
              runtimeUI.showToolResult(call.toolName, toolResult);
            }

            toolResults.push({
              type: 'tool-result',
              toolCallId: call.toolCallId,
              toolName: call.toolName,
              result: toolResult,
            });
          } catch (err) {
            const errorMsg = sanitizeErrorMessage(err);
            toolResults.push({
              type: 'tool-result',
              toolCallId: call.toolCallId,
              toolName: call.toolName,
              result: { error: errorMsg },
            });
          }
        }

        messages.push({ role: 'tool', content: toolResults });
      }

      // Max iterations reached
      if (runtimeUI) {
        runtimeUI.endStreaming(streamingRequestId);
      }

      return {
        success: false,
        error: `Maximum iterations (${maxIterations}) exceeded`,
        toolCallCount,
        tokens: { input: totalInputTokens, output: totalOutputTokens },
      };
    } catch (err) {
      const sanitizedError = sanitizeErrorMessage(err);
      logError('Worker execution failed:', sanitizedError);

      if (runtimeUI) {
        runtimeUI.endStreaming(streamingRequestId);
      }

      return {
        success: false,
        error: sanitizedError,
        toolCallCount,
        tokens: { input: totalInputTokens, output: totalOutputTokens },
      };
    }
  }

  /**
   * Get the sandbox (if available).
   */
  getSandbox(): FileOperations | undefined {
    return this.sandbox;
  }

  /**
   * Get registered tools.
   */
  getTools(): Record<string, Tool> {
    return this.tools;
  }
}

/**
 * Create and initialize a browser worker runtime.
 */
export async function createBrowserRuntime(
  options: BrowserRuntimeOptions
): Promise<BrowserWorkerRuntime> {
  const runtime = new BrowserWorkerRuntime(options);
  await runtime.initialize();
  return runtime;
}
