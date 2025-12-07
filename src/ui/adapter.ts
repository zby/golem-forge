/**
 * UI Adapter Interface
 *
 * Abstract interface for UI implementations.
 * Enables platform-independent worker execution (CLI, browser, etc.).
 */

import type {
  Message,
  UIApprovalRequest,
  UIApprovalResult,
  ManualToolInfo,
  ManualToolHandler,
  TaskProgress,
  StatusUpdate,
  DiffContent,
} from "./types.js";

/**
 * Abstract UI adapter interface.
 *
 * Implementations provide platform-specific UI for:
 * - Conversation display
 * - User input handling
 * - Approval dialogs
 * - Manual tool invocation
 * - Progress display
 * - Interruption handling
 */
export interface UIAdapter {
  // ============================================================================
  // Conversation
  // ============================================================================

  /**
   * Display a message in the conversation.
   */
  displayMessage(msg: Message): Promise<void>;

  /**
   * Get input from the user.
   * Returns the user's input string.
   */
  getUserInput(prompt?: string): Promise<string>;

  // ============================================================================
  // Approval
  // ============================================================================

  /**
   * Request user approval for an operation.
   * Blocks until the user decides.
   */
  requestApproval(request: UIApprovalRequest): Promise<UIApprovalResult>;

  // ============================================================================
  // Manual Tools
  // ============================================================================

  /**
   * Display available manual tools.
   * Called when manual tools are registered.
   */
  displayManualTools(tools: ManualToolInfo[]): void;

  /**
   * Register a handler for manual tool requests.
   * The handler is called when the user invokes a manual tool.
   */
  onManualToolRequest(handler: ManualToolHandler): void;

  // ============================================================================
  // Interruption
  // ============================================================================

  /**
   * Register a handler for interruption.
   * Called when the user interrupts execution (e.g., Esc key).
   */
  onInterrupt(handler: () => void): void;

  // ============================================================================
  // Progress
  // ============================================================================

  /**
   * Show progress for a task.
   */
  showProgress(task: TaskProgress): void;

  /**
   * Update status display.
   */
  updateStatus(status: StatusUpdate): void;

  // ============================================================================
  // Diff Review
  // ============================================================================

  /**
   * Display a diff for review.
   */
  displayDiff(diff: DiffContent): Promise<void>;

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Initialize the adapter.
   * Called before first use.
   */
  initialize(): Promise<void>;

  /**
   * Shutdown the adapter.
   * Called when done.
   */
  shutdown(): Promise<void>;
}
