/**
 * Runtime UI
 *
 * High-level convenience wrapper around UIEventBus for runtime use.
 * Provides methods that emit events and handle request/response correlation.
 *
 * @module @golem-forge/core/runtime-ui
 */

import type { UIEventBus } from './ui-event-bus.js';
import type {
  DisplayMessage,
  StatusType,
  ApprovalType,
  ApprovalRisk,
  WorkerInfo,
  WorkerStatus,
  ToolResultValueEvent,
  ManualToolInfoEvent,
  DiffFileSummary,
  ApprovalResponseEvent,
  UserInputEvent,
} from './ui-events.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for approval requests
 */
export interface ApprovalOptions {
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Timeout in milliseconds (default: 5 minutes) */
  timeoutMs?: number;
}

/**
 * Approval response result
 */
export type ApprovalResult =
  | { approved: true }
  | { approved: false; reason?: string }
  | { approved: 'always' }
  | { approved: 'session' };

/**
 * Options for user input requests
 */
export interface InputOptions {
  /** Abort signal for cancellation */
  signal?: AbortSignal;
  /** Timeout in milliseconds */
  timeoutMs?: number;
}

/**
 * High-level runtime API built on event bus.
 * Used by runtime to communicate with UI implementations.
 */
export interface RuntimeUI {
  /** The underlying event bus */
  readonly bus: UIEventBus;

  // -------------------------------------------------------------------------
  // Display Methods (fire-and-forget)
  // -------------------------------------------------------------------------

  /** Show a message in the conversation */
  showMessage(message: DisplayMessage): void;

  /** Show a status notification */
  showStatus(type: StatusType, message: string): void;

  /** Start streaming response */
  startStreaming(requestId: string): void;

  /** Append to streaming response */
  appendStreaming(requestId: string, delta: string): void;

  /** End streaming response */
  endStreaming(requestId: string): void;

  /** Show tool started */
  showToolStarted(
    toolCallId: string,
    toolName: string,
    args: Record<string, unknown>,
    workerId?: string
  ): void;

  /** Show tool result */
  showToolResult(
    toolCallId: string,
    toolName: string,
    status: 'success' | 'error' | 'interrupted',
    durationMs: number,
    value?: ToolResultValueEvent,
    error?: string
  ): void;

  /** Update worker status */
  updateWorker(
    workerId: string,
    task: string,
    status: WorkerStatus,
    parentId?: string,
    depth?: number
  ): void;

  /** Show available manual tools */
  showManualTools(tools: ManualToolInfoEvent[]): void;

  /** Show diff summary */
  showDiffSummary(requestId: string, summaries: DiffFileSummary[]): void;

  /** Show full diff content (response to getDiff) */
  showDiffContent(
    requestId: string,
    path: string,
    original: string | undefined,
    modified: string,
    isNew: boolean
  ): void;

  /** Notify session end */
  endSession(reason: 'completed' | 'error' | 'interrupted', message?: string): void;

  // -------------------------------------------------------------------------
  // Blocking Methods (emit request, await response)
  // -------------------------------------------------------------------------

  /**
   * Request user approval.
   * Emits approvalRequired event and waits for approvalResponse.
   */
  requestApproval(
    type: ApprovalType,
    description: string,
    details: unknown,
    risk: ApprovalRisk,
    workerPath: WorkerInfo[],
    options?: ApprovalOptions
  ): Promise<ApprovalResult>;

  /**
   * Get user input.
   * Emits inputPrompt event and waits for userInput response.
   */
  getUserInput(prompt?: string, options?: InputOptions): Promise<string>;

  // -------------------------------------------------------------------------
  // Subscription Helpers
  // -------------------------------------------------------------------------

  /** Subscribe to interrupt events */
  onInterrupt(handler: (reason?: string) => void): () => void;

  /** Subscribe to manual tool invocation events */
  onManualToolInvoke(
    handler: (toolName: string, args: Record<string, unknown>) => void
  ): () => void;

  /** Subscribe to getDiff requests (for diff drill-down) */
  onGetDiff(
    handler: (requestId: string, path: string) => void
  ): () => void;
}

// ============================================================================
// Default Options
// ============================================================================

const DEFAULT_APPROVAL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_INPUT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// ============================================================================
// Implementation
// ============================================================================

/**
 * Create a RuntimeUI instance wrapping an event bus.
 *
 * @param bus - The UIEventBus to use for communication
 * @returns RuntimeUI instance
 *
 * @example
 * ```typescript
 * const bus = createUIEventBus();
 * const ui = createRuntimeUI(bus);
 *
 * // Show a message
 * ui.showMessage({ role: 'assistant', content: 'Hello!' });
 *
 * // Request approval (blocking)
 * const result = await ui.requestApproval(
 *   'tool_call',
 *   'Execute npm install',
 *   { command: 'npm install' },
 *   'medium',
 *   [{ id: 'root', depth: 0, task: 'Install dependencies' }]
 * );
 *
 * if (result.approved) {
 *   // Proceed with operation
 * }
 * ```
 */
export function createRuntimeUI(bus: UIEventBus): RuntimeUI {
  // Generate unique request IDs
  let requestCounter = 0;
  function generateRequestId(): string {
    return `req-${Date.now()}-${++requestCounter}`;
  }

  return {
    bus,

    // -------------------------------------------------------------------------
    // Display Methods
    // -------------------------------------------------------------------------

    showMessage(message: DisplayMessage): void {
      bus.emit('message', { message });
    },

    showStatus(type: StatusType, message: string): void {
      bus.emit('status', { type, message });
    },

    startStreaming(requestId: string): void {
      bus.emit('streaming', { requestId, delta: '', done: false });
    },

    appendStreaming(requestId: string, delta: string): void {
      bus.emit('streaming', { requestId, delta, done: false });
    },

    endStreaming(requestId: string): void {
      bus.emit('streaming', { requestId, delta: '', done: true });
    },

    showToolStarted(
      toolCallId: string,
      toolName: string,
      args: Record<string, unknown>,
      workerId?: string
    ): void {
      bus.emit('toolStarted', { toolCallId, toolName, args, workerId });
    },

    showToolResult(
      toolCallId: string,
      toolName: string,
      status: 'success' | 'error' | 'interrupted',
      durationMs: number,
      value?: ToolResultValueEvent,
      error?: string
    ): void {
      bus.emit('toolResult', { toolCallId, toolName, status, durationMs, value, error });
    },

    updateWorker(
      workerId: string,
      task: string,
      status: WorkerStatus,
      parentId?: string,
      depth: number = 0
    ): void {
      bus.emit('workerUpdate', { workerId, task, status, parentId, depth });
    },

    showManualTools(tools: ManualToolInfoEvent[]): void {
      bus.emit('manualToolsAvailable', { tools });
    },

    showDiffSummary(requestId: string, summaries: DiffFileSummary[]): void {
      bus.emit('diffSummary', { requestId, summaries });
    },

    showDiffContent(
      requestId: string,
      path: string,
      original: string | undefined,
      modified: string,
      isNew: boolean
    ): void {
      bus.emit('diffContent', { requestId, path, original, modified, isNew });
    },

    endSession(
      reason: 'completed' | 'error' | 'interrupted',
      message?: string
    ): void {
      bus.emit('sessionEnd', { reason, message });
    },

    // -------------------------------------------------------------------------
    // Blocking Methods
    // -------------------------------------------------------------------------

    async requestApproval(
      type: ApprovalType,
      description: string,
      details: unknown,
      risk: ApprovalRisk,
      workerPath: WorkerInfo[],
      options?: ApprovalOptions
    ): Promise<ApprovalResult> {
      const requestId = generateRequestId();
      const timeoutMs = options?.timeoutMs ?? DEFAULT_APPROVAL_TIMEOUT_MS;

      return new Promise((resolve, reject) => {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        let unsubscribe: (() => void) | undefined;
        let abortHandler: (() => void) | undefined;

        function cleanup(): void {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          if (unsubscribe) {
            unsubscribe();
          }
          if (abortHandler && options?.signal) {
            options.signal.removeEventListener('abort', abortHandler);
          }
        }

        // Set up timeout
        timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error('Approval request timed out'));
        }, timeoutMs);

        // Set up abort handler
        if (options?.signal) {
          abortHandler = () => {
            cleanup();
            reject(new Error('Approval request aborted'));
          };
          options.signal.addEventListener('abort', abortHandler);
        }

        // Subscribe to response
        unsubscribe = bus.on('approvalResponse', (response: ApprovalResponseEvent) => {
          if (response.requestId === requestId) {
            cleanup();

            // Convert response to ApprovalResult
            if (response.approved === true) {
              resolve({ approved: true });
            } else if (response.approved === false) {
              resolve({ approved: false, reason: response.reason });
            } else {
              resolve({ approved: response.approved });
            }
          }
        });

        // Emit request
        bus.emit('approvalRequired', {
          requestId,
          type,
          description,
          details,
          risk,
          workerPath,
        });
      });
    },

    async getUserInput(prompt: string = '> ', options?: InputOptions): Promise<string> {
      const requestId = generateRequestId();
      const timeoutMs = options?.timeoutMs ?? DEFAULT_INPUT_TIMEOUT_MS;

      return new Promise((resolve, reject) => {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        let unsubscribe: (() => void) | undefined;
        let abortHandler: (() => void) | undefined;

        function cleanup(): void {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          if (unsubscribe) {
            unsubscribe();
          }
          if (abortHandler && options?.signal) {
            options.signal.removeEventListener('abort', abortHandler);
          }
        }

        // Set up timeout
        timeoutId = setTimeout(() => {
          cleanup();
          reject(new Error('User input request timed out'));
        }, timeoutMs);

        // Set up abort handler
        if (options?.signal) {
          abortHandler = () => {
            cleanup();
            reject(new Error('User input request aborted'));
          };
          options.signal.addEventListener('abort', abortHandler);
        }

        // Subscribe to response
        unsubscribe = bus.on('userInput', (input: UserInputEvent) => {
          if (input.requestId === requestId) {
            cleanup();
            resolve(input.content);
          }
        });

        // Emit request
        bus.emit('inputPrompt', { requestId, prompt });
      });
    },

    // -------------------------------------------------------------------------
    // Subscription Helpers
    // -------------------------------------------------------------------------

    onInterrupt(handler: (reason?: string) => void): () => void {
      return bus.on('interrupt', (event) => handler(event.reason));
    },

    onManualToolInvoke(
      handler: (toolName: string, args: Record<string, unknown>) => void
    ): () => void {
      return bus.on('manualToolInvoke', (event) =>
        handler(event.toolName, event.args)
      );
    },

    onGetDiff(
      handler: (requestId: string, path: string) => void
    ): () => void {
      return bus.on('getDiff', (event) =>
        handler(event.requestId, event.path)
      );
    },
  };
}
