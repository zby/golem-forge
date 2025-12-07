/**
 * UI Abstraction Types
 *
 * Core types for the UI abstraction layer.
 * These types enable platform-independent UI implementations.
 */

// Re-export execution mode types from tools module
export type { ExecutionMode, ManualExecutionConfig } from "../tools/filesystem.js";

/**
 * Tool call information for display purposes.
 */
export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * Field types derivable from Zod schema.
 */
export type FieldType = "text" | "number" | "select" | "boolean";

/**
 * A field in a manual tool's input form.
 */
export interface ManualToolField {
  /** Field name (matches input schema key) */
  name: string;
  /** Human-readable description */
  description: string;
  /** Field type for rendering */
  type: FieldType;
  /** Whether the field is required */
  required: boolean;
  /** Options for select fields */
  options?: string[];
  /** Default value */
  default?: unknown;
}

/**
 * UI representation of a manual tool.
 * Used by UIAdapter to display available manual tools.
 */
export interface ManualToolInfo {
  /** Tool name (for invocation) */
  name: string;
  /** Human-readable label */
  label: string;
  /** Tool description */
  description: string;
  /** Category for grouping */
  category?: string;
  /** Input fields derived from schema */
  fields: ManualToolField[];
}

/**
 * Result of manual tool invocation.
 */
export interface ManualToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Handler for manual tool invocation.
 */
export type ManualToolHandler = (
  toolName: string,
  args: Record<string, unknown>
) => Promise<ManualToolResult>;

// ============================================================================
// Messages
// ============================================================================

/**
 * A message in the conversation.
 */
export interface Message {
  /** Message role */
  role: "user" | "assistant" | "system";
  /** Message content */
  content: string;
  /** Optional metadata */
  metadata?: {
    toolCalls?: ToolCall[];
    timestamp: number;
  };
}

// ============================================================================
// Approval
// ============================================================================

/**
 * Information about a worker in the delegation chain.
 */
export interface WorkerInfo {
  /** Worker ID */
  id: string;
  /** Depth in worker tree */
  depth: number;
  /** Task description */
  task: string;
}

/**
 * Request for user approval before executing a tool.
 */
export interface UIApprovalRequest {
  /** Type of operation */
  type: "tool_call" | "file_write" | "command";
  /** Human-readable description */
  description: string;
  /** Operation details */
  details: unknown;
  /** Risk level */
  risk: "low" | "medium" | "high";
  /** Worker delegation chain */
  workerPath: WorkerInfo[];
}

/**
 * Result of an approval request.
 */
export type UIApprovalResult =
  | { approved: true }
  | { approved: false; reason?: string }
  | { approved: "always" }
  | { approved: "session" };

// ============================================================================
// Progress
// ============================================================================

/**
 * Progress status for a task.
 */
export type TaskStatus = "pending" | "running" | "complete" | "error";

/**
 * Progress information for display.
 */
export interface TaskProgress {
  /** Task ID */
  id: string;
  /** Task description */
  description: string;
  /** Current status */
  status: TaskStatus;
  /** Depth in worker tree */
  depth: number;
  /** Parent task ID (if nested) */
  parentId?: string;
}

/**
 * Status update for display.
 */
export interface StatusUpdate {
  /** Type of status */
  type: "info" | "warning" | "error";
  /** Status message */
  message: string;
}

// ============================================================================
// Diff
// ============================================================================

/**
 * Content for diff display.
 */
export interface DiffContent {
  /** File path */
  path: string;
  /** Original content */
  original?: string;
  /** Modified content */
  modified: string;
  /** Whether this is a new file */
  isNew: boolean;
}

// ============================================================================
// Interruption
// ============================================================================

/**
 * Interrupt signal checked by tool loop.
 */
export interface InterruptSignal {
  /** Whether interrupted */
  interrupted: boolean;
  /** Trigger an interrupt */
  interrupt(): void;
  /** Reset the signal */
  reset(): void;
}

/**
 * Tool result types including interrupted state.
 */
export type ToolResult<T = unknown> =
  | { type: "success"; value: T }
  | { type: "error"; error: string }
  | { type: "interrupted"; partial?: Partial<T> };
