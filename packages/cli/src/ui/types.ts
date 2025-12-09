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
 * Used by UI implementations to display available manual tools.
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
// Progress (re-exported from core)
// ============================================================================

// Re-export progress types from core
export type { WorkerStatus as TaskStatus, TaskProgress } from "@golem-forge/core";

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

/**
 * Summary of changes for a single file.
 * Used for compact diff display in approval dialogs.
 */
export interface DiffSummary {
  /** File path */
  path: string;
  /** Type of change */
  operation: "create" | "update" | "delete";
  /** Number of lines added */
  additions: number;
  /** Number of lines removed */
  deletions: number;
}

/**
 * Options for displaying diff summary with drill-down capability.
 */
export interface DiffSummaryDisplayOptions {
  /** Callback to get full diff for a file (enables drill-down) */
  getDiff?: (path: string) => Promise<string>;
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

// ============================================================================
// Structured Tool Results (re-exported from core)
// ============================================================================

// Import and re-export tool result value types from core
import type {
  DisplayHints,
  WellKnownKind,
  TextResultValue,
  DiffResultValue,
  FileContentResultValue,
  FileListResultValue,
  JsonResultValue,
  CustomResultValue,
  WellKnownResultValue,
  ToolResultValue,
} from "@golem-forge/core";

export type {
  DisplayHints,
  WellKnownKind,
  TextResultValue,
  DiffResultValue,
  FileContentResultValue,
  FileListResultValue,
  JsonResultValue,
  CustomResultValue,
  WellKnownResultValue,
  ToolResultValue,
};

/**
 * Typed tool result with status information.
 * Used by UI implementations to display tool execution results.
 */
export interface TypedToolResult {
  /** Tool name that produced this result */
  toolName: string;
  /** Tool call ID for correlation */
  toolCallId: string;
  /** Execution status */
  status: "success" | "error" | "interrupted";
  /** Structured result value (only for success) */
  value?: ToolResultValue;
  /** Error message (only for error status) */
  error?: string;
  /** Execution duration in milliseconds */
  durationMs: number;
}
