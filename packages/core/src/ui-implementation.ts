/**
 * UI Implementation Interface
 *
 * Interface for UI implementations that connect to the UIEventBus.
 * Implementations subscribe to display events and emit action events.
 *
 * @module @golem-forge/core/ui-implementation
 */

import type { UIEventBus } from './ui-event-bus.js';
import type { ApprovalResponseEvent, UserInputEvent } from './ui-events.js';

/**
 * Interface for UI implementations.
 *
 * UI implementations:
 * - Subscribe to display events from the bus (message, streaming, status, etc.)
 * - Emit action events to the bus (userInput, approvalResponse, interrupt, etc.)
 * - Handle lifecycle (initialize/shutdown)
 *
 * @example
 * ```typescript
 * class MyUIImplementation implements UIImplementation {
 *   readonly bus: UIEventBus;
 *
 *   constructor(bus: UIEventBus) {
 *     this.bus = bus;
 *   }
 *
 *   async initialize(): Promise<void> {
 *     // Subscribe to display events
 *     this.bus.on('message', (event) => this.renderMessage(event));
 *     this.bus.on('approvalRequired', (event) => this.showApprovalDialog(event));
 *   }
 *
 *   sendApprovalResponse(requestId: string, response: ApprovalResponse): void {
 *     this.bus.emit('approvalResponse', { requestId, ...response });
 *   }
 * }
 * ```
 */
export interface UIImplementation {
  /** The event bus for communication */
  readonly bus: UIEventBus;

  // -------------------------------------------------------------------------
  // Action Methods (UI -> Runtime)
  // -------------------------------------------------------------------------

  /**
   * Send user's approval response.
   * Called when user responds to an approval dialog.
   */
  sendApprovalResponse(
    requestId: string,
    approved: boolean | 'always' | 'session',
    reason?: string
  ): void;

  /**
   * Send user input.
   * Called when user submits input in response to inputPrompt.
   */
  sendUserInput(requestId: string, content: string): void;

  /**
   * Send interrupt signal.
   * Called when user wants to interrupt execution.
   */
  sendInterrupt(reason?: string): void;

  /**
   * Request full diff for a file.
   * Called when user wants to drill down from diff summary.
   */
  requestDiff(requestId: string, path: string): void;

  /**
   * Invoke a manual tool.
   * Called when user invokes a tool manually.
   */
  invokeManualTool(toolName: string, args: Record<string, unknown>): void;

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Initialize the UI.
   * Subscribe to display events and set up rendering.
   */
  initialize(): Promise<void>;

  /**
   * Shutdown the UI.
   * Clean up subscriptions and resources.
   */
  shutdown(): Promise<void>;
}

/**
 * Base class for UI implementations with common functionality.
 * Provides default implementations for action methods.
 */
export abstract class BaseUIImplementation implements UIImplementation {
  readonly bus: UIEventBus;

  constructor(bus: UIEventBus) {
    this.bus = bus;
  }

  sendApprovalResponse(
    requestId: string,
    approved: boolean | 'always' | 'session',
    reason?: string
  ): void {
    const response: ApprovalResponseEvent = { requestId, approved };
    if (reason !== undefined) {
      response.reason = reason;
    }
    this.bus.emit('approvalResponse', response);
  }

  sendUserInput(requestId: string, content: string): void {
    const input: UserInputEvent = { requestId, content };
    this.bus.emit('userInput', input);
  }

  sendInterrupt(reason?: string): void {
    this.bus.emit('interrupt', { reason });
  }

  requestDiff(requestId: string, path: string): void {
    this.bus.emit('getDiff', { requestId, path });
  }

  invokeManualTool(toolName: string, args: Record<string, unknown>): void {
    this.bus.emit('manualToolInvoke', { toolName, args });
  }

  abstract initialize(): Promise<void>;
  abstract shutdown(): Promise<void>;
}
