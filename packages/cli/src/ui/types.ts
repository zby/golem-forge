/**
 * UI Abstraction Types (CLI shim)
 *
 * Platform-agnostic UI event types live in `@golem-forge/core` (ui-events).
 * CLI keeps a small shim layer for convenience re-exports.
 */

export type { ExecutionMode, ManualExecutionConfig } from "@golem-forge/core";

// ---------------------------------------------------------------------------
// Manual tools (UI-facing)
// ---------------------------------------------------------------------------

export type FieldType = import("@golem-forge/core").ManualToolFieldEvent["type"];
export type ManualToolField = import("@golem-forge/core").ManualToolFieldEvent;
export type ManualToolInfo = import("@golem-forge/core").ManualToolInfoEvent;

export interface ManualToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

export type ManualToolHandler = (
  toolName: string,
  args: Record<string, unknown>
) => Promise<ManualToolResult>;

// ---------------------------------------------------------------------------
// Approvals
// ---------------------------------------------------------------------------

export type WorkerInfo = import("@golem-forge/core").WorkerInfo;
export type UIApprovalRequest = import("@golem-forge/core").ApprovalRequiredEvent;

export type UIApprovalResult =
  | { approved: true }
  | { approved: false; reason?: string }
  | { approved: "always" }
  | { approved: "session" };

// ---------------------------------------------------------------------------
// Progress / status
// ---------------------------------------------------------------------------

export type { WorkerStatus as TaskStatus } from "@golem-forge/core";
export type { TaskProgress } from "@golem-forge/ui-react";

export type StatusUpdate = import("@golem-forge/core").StatusEvent;

// ---------------------------------------------------------------------------
// Diffs
// ---------------------------------------------------------------------------

export type DiffContent = Omit<import("@golem-forge/core").DiffContentEvent, "requestId">;
export type DiffSummary = import("@golem-forge/core").DiffFileSummary;

// ---------------------------------------------------------------------------
// Interrupts
// ---------------------------------------------------------------------------

export type InterruptSignal = import("@golem-forge/core").InterruptSignal;

export type ToolResult<T = unknown> =
  | { type: "success"; value: T }
  | { type: "error"; error: string }
  | { type: "interrupted"; partial?: Partial<T> };

// ---------------------------------------------------------------------------
// Structured tool results (core)
// ---------------------------------------------------------------------------

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
} from "@golem-forge/core";

export type TypedToolResult = import("@golem-forge/core").ToolResultEvent;

