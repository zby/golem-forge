/**
 * UI Event Types
 *
 * Event-driven UI architecture types for platform-agnostic communication
 * between runtime and UI implementations.
 *
 * @module @golem-forge/core/ui-events
 */

// ============================================================================
// Base Types (shared across events)
// ============================================================================

/**
 * Message roles in conversation
 */
export type MessageRole = 'user' | 'assistant' | 'system';

/**
 * A message in the conversation
 */
export interface Message {
  role: MessageRole;
  content: string;
  timestamp?: number;
}

/**
 * Risk levels for approval requests
 */
export type ApprovalRisk = 'low' | 'medium' | 'high';

/**
 * Types of operations that require approval
 */
export type ApprovalType = 'tool_call' | 'file_write' | 'command';

/**
 * Worker status in the tree
 */
export type WorkerStatus = 'pending' | 'running' | 'complete' | 'error';

/**
 * Information about a worker in the delegation chain
 */
export interface WorkerInfo {
  id: string;
  depth: number;
  task: string;
}

/**
 * Status notification types
 */
export type StatusType = 'info' | 'warning' | 'error';

/**
 * Tool result status
 */
export type ToolResultStatus = 'success' | 'error' | 'interrupted';

// ============================================================================
// Display Events (Runtime -> UI)
// ============================================================================

/**
 * Message to display in conversation
 */
export interface MessageEvent {
  message: Message;
}

/**
 * Streaming text update (token-by-token output)
 */
export interface StreamingEvent {
  /** Request ID for correlation with commit */
  requestId: string;
  /** Delta content (append to existing) */
  delta: string;
  /** Whether this is the final chunk */
  done: boolean;
}

/**
 * Status notification
 */
export interface StatusEvent {
  type: StatusType;
  message: string;
}

/**
 * Tool execution started
 */
export interface ToolStartedEvent {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  /** Worker that invoked the tool */
  workerId?: string;
}

// ============================================================================
// Structured Tool Result Values
// ============================================================================

/**
 * Plain text result.
 */
export interface TextResultValue {
  kind: 'text';
  /** The text content */
  content: string;
}

/**
 * File diff result showing changes to a file.
 */
export interface DiffResultValue {
  kind: 'diff';
  /** File path */
  path: string;
  /** Original content */
  original?: string;
  /** Modified content */
  modified: string;
  /** Whether this is a new file */
  isNew: boolean;
  /** Number of bytes written */
  bytesWritten: number;
}

/**
 * File content result (from read operations).
 */
export interface FileContentResultValue {
  kind: 'file_content';
  /** File path */
  path: string;
  /** File content */
  content: string;
  /** File size in bytes */
  size: number;
}

/**
 * File list result.
 */
export interface FileListResultValue {
  kind: 'file_list';
  /** Directory path that was listed */
  path: string;
  /** List of file/directory names */
  files: string[];
  /** Number of entries */
  count: number;
}

/**
 * JSON/structured data result.
 */
export interface JsonResultValue {
  kind: 'json';
  /** The structured data */
  data: unknown;
  /** Optional summary for display */
  summary?: string;
}

/**
 * Discriminated union of all tool result value types.
 * Tools can return these typed values for proper UI rendering.
 */
export type ToolResultValue =
  | TextResultValue
  | DiffResultValue
  | FileContentResultValue
  | FileListResultValue
  | JsonResultValue;

/**
 * Tool execution completed
 */
export interface ToolResultEvent {
  toolCallId: string;
  toolName: string;
  status: ToolResultStatus;
  /** Structured result value */
  value?: ToolResultValue;
  /** Error message if status is error */
  error?: string;
  durationMs: number;
}

/**
 * Worker tree update
 */
export interface WorkerUpdateEvent {
  workerId: string;
  task: string;
  status: WorkerStatus;
  parentId?: string;
  depth: number;
}

/**
 * Approval required from user
 */
export interface ApprovalRequiredEvent {
  /** Unique request ID for correlation */
  requestId: string;
  type: ApprovalType;
  description: string;
  details: unknown;
  risk: ApprovalRisk;
  /** Worker delegation chain leading to this request */
  workerPath: WorkerInfo[];
}

/**
 * Manual tools available for user invocation
 */
export interface ManualToolsAvailableEvent {
  tools: ManualToolInfoEvent[];
}

/**
 * Manual tool information for display
 */
export interface ManualToolInfoEvent {
  name: string;
  label: string;
  description: string;
  category?: string;
  fields: ManualToolFieldEvent[];
}

/**
 * Manual tool field definition
 */
export interface ManualToolFieldEvent {
  name: string;
  description: string;
  type: 'text' | 'number' | 'select' | 'boolean';
  required: boolean;
  options?: string[];
  default?: unknown;
}

/**
 * Diff summary for file changes
 */
export interface DiffSummaryEvent {
  /** Request ID for drill-down correlation */
  requestId: string;
  summaries: DiffFileSummary[];
}

/**
 * Summary of changes for a single file
 */
export interface DiffFileSummary {
  path: string;
  operation: 'create' | 'update' | 'delete';
  additions: number;
  deletions: number;
}

/**
 * Full diff content for a file (response to getDiff action)
 */
export interface DiffContentEvent {
  requestId: string;
  path: string;
  original?: string;
  modified: string;
  isNew: boolean;
}

/**
 * Input prompt request
 */
export interface InputPromptEvent {
  /** Unique request ID for correlation */
  requestId: string;
  prompt: string;
}

/**
 * Session ended notification
 */
export interface SessionEndEvent {
  reason: 'completed' | 'error' | 'interrupted';
  message?: string;
}

// ============================================================================
// Action Events (UI -> Runtime)
// ============================================================================

/**
 * User input submitted
 */
export interface UserInputEvent {
  /** Request ID from InputPromptEvent */
  requestId: string;
  content: string;
}

/**
 * User response to approval request
 */
export interface ApprovalResponseEvent {
  /** Request ID from ApprovalRequiredEvent */
  requestId: string;
  approved: boolean | 'always' | 'session';
  reason?: string;
}

/**
 * User invoked a manual tool
 */
export interface ManualToolInvokeEvent {
  toolName: string;
  args: Record<string, unknown>;
}

/**
 * User requested interrupt
 */
export interface InterruptEvent {
  reason?: string;
}

/**
 * User requested full diff for a file (drill-down from summary)
 */
export interface GetDiffEvent {
  /** Request ID from DiffSummaryEvent */
  requestId: string;
  path: string;
}

// ============================================================================
// Event Maps
// ============================================================================

/**
 * Display events - runtime to UI (fire-and-forget)
 */
export interface DisplayEvents {
  message: MessageEvent;
  streaming: StreamingEvent;
  status: StatusEvent;
  toolStarted: ToolStartedEvent;
  toolResult: ToolResultEvent;
  workerUpdate: WorkerUpdateEvent;
  approvalRequired: ApprovalRequiredEvent;
  manualToolsAvailable: ManualToolsAvailableEvent;
  diffSummary: DiffSummaryEvent;
  diffContent: DiffContentEvent;
  inputPrompt: InputPromptEvent;
  sessionEnd: SessionEndEvent;
}

/**
 * Action events - UI to runtime
 */
export interface ActionEvents {
  userInput: UserInputEvent;
  approvalResponse: ApprovalResponseEvent;
  manualToolInvoke: ManualToolInvokeEvent;
  interrupt: InterruptEvent;
  getDiff: GetDiffEvent;
}

/**
 * All events combined
 */
export type AllEvents = DisplayEvents & ActionEvents;

/**
 * Union type of all event names
 */
export type EventName = keyof AllEvents;

/**
 * Callback type for unsubscribing from events
 */
export type Unsubscribe = () => void;
