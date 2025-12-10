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
 * Display hints for UI rendering.
 * UIs use these hints for unknown result types or to customize display.
 */
export interface DisplayHints {
  /**
   * Suggested view mode for the data.
   */
  preferredView?:
    | 'text'       // Plain text, preserve whitespace
    | 'markdown'   // Render as markdown
    | 'code'       // Syntax-highlighted code block
    | 'diff'       // Side-by-side or unified diff view
    | 'table'      // Tabular data
    | 'tree'       // Hierarchical/nested structure
    | 'image'      // Image display
    | 'raw'        // Raw JSON/data dump
    | 'hidden';    // Don't display (internal result)

  /**
   * Language hint for code highlighting.
   */
  language?: string;

  /**
   * Whether the result should be collapsed by default.
   */
  collapsed?: boolean;

  /**
   * Maximum height before scrolling (in lines or pixels depending on UI).
   */
  maxHeight?: number;

  /**
   * Priority for display ordering (higher = more prominent).
   */
  priority?: number;
}

/**
 * Plain text result.
 */
export interface TextResultValue {
  kind: 'text';
  /** The text content */
  content: string;
  /** Human-readable summary for compact display */
  summary?: string;
  /** MIME type hint (e.g., 'text/plain', 'text/markdown') */
  mimeType?: string;
  /** Display hints for UI rendering */
  display?: DisplayHints;
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
  /** Human-readable summary (e.g., "+15 -3 lines") */
  summary?: string;
  /** Display hints for UI rendering */
  display?: DisplayHints;
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
  /** Human-readable summary (e.g., "Read /path/file.txt (1234 bytes)") */
  summary?: string;
  /** MIME type hint (detected from file extension) */
  mimeType?: string;
  /** Display hints for UI rendering */
  display?: DisplayHints;
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
  /** Human-readable summary (e.g., "42 files") */
  summary?: string;
  /** Display hints for UI rendering */
  display?: DisplayHints;
}

/**
 * JSON/structured data result.
 */
export interface JsonResultValue {
  kind: 'json';
  /** The structured data */
  data: unknown;
  /** Human-readable summary for display */
  summary?: string;
  /** MIME type hint (typically 'application/json') */
  mimeType?: string;
  /** Display hints for UI rendering */
  display?: DisplayHints;
}

/**
 * Well-known kind string literals.
 */
export type WellKnownKind = 'text' | 'diff' | 'file_content' | 'file_list' | 'json';

/**
 * Array of well-known kinds for runtime validation.
 */
export const WELL_KNOWN_KINDS: readonly WellKnownKind[] = ['text', 'diff', 'file_content', 'file_list', 'json'];

/**
 * Pattern for valid custom kind identifiers.
 * Allows: lowercase letters, numbers, underscores, and dots for namespacing.
 * Must start with a lowercase letter.
 * Examples: 'git_status', 'git.status', 'mycompany.custom_type'
 */
const KIND_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

/**
 * Check if a kind string is valid.
 * Valid kinds are either well-known or match the custom kind pattern.
 *
 * @param kind - Kind string to validate
 * @returns True if the kind is valid
 */
export function isValidKind(kind: string): boolean {
  // Well-known kinds are always valid
  if ((WELL_KNOWN_KINDS as readonly string[]).includes(kind)) {
    return true;
  }
  // Custom kinds must match the pattern
  return KIND_PATTERN.test(kind);
}

/**
 * Check if a kind is a well-known kind.
 *
 * @param kind - Kind string to check
 * @returns True if the kind is well-known
 */
export function isWellKnownKind(kind: string): kind is WellKnownKind {
  return (WELL_KNOWN_KINDS as readonly string[]).includes(kind);
}

/**
 * Check if a value is a structured ToolResultValue.
 * Accepts both well-known kinds and valid custom kinds.
 *
 * @param value - Value to check
 * @returns True if value has a valid `kind` discriminator
 */
export function isToolResultValue(value: unknown): value is ToolResultValue {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const obj = value as Record<string, unknown>;

  if (typeof obj.kind !== 'string') {
    return false;
  }

  return isValidKind(obj.kind);
}

/**
 * Custom/unknown result type.
 * Used for tool-defined result types not in the well-known set.
 * UIs should use display hints to render these gracefully.
 */
export interface CustomResultValue {
  /**
   * Custom type identifier.
   * Must not be a well-known kind.
   * Convention: lowercase with dots for namespacing (e.g., 'git.status', 'mycompany.report')
   */
  kind: Exclude<string, WellKnownKind>;
  /** The result data - structure depends on kind */
  data: unknown;
  /** Human-readable summary for compact display */
  summary?: string;
  /** MIME type hint for data interpretation */
  mimeType?: string;
  /** Display hints for UI rendering */
  display?: DisplayHints;
}

/**
 * Well-known tool result value types.
 * These have standardized structures that UIs can optimize for.
 */
export type WellKnownResultValue =
  | TextResultValue
  | DiffResultValue
  | FileContentResultValue
  | FileListResultValue
  | JsonResultValue;

/**
 * Discriminated union of all tool result value types.
 * Includes well-known types and custom types for extensibility.
 * UIs should render well-known types with specialized components,
 * and use display hints for custom types.
 */
export type ToolResultValue = WellKnownResultValue | CustomResultValue;

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

/**
 * Context usage update (for chat mode)
 */
export interface ContextUsageEvent {
  /** Tokens used so far */
  tokensUsed: number;
  /** Maximum token limit */
  tokenLimit: number;
  /** Whether limit has been exceeded */
  exceeded: boolean;
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
  contextUsage: ContextUsageEvent;
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
