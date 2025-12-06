/**
 * Runtime Events
 *
 * Event types emitted during worker execution for observability and debugging.
 */

/**
 * Base event with common properties.
 */
interface BaseEvent {
  /** Timestamp when the event occurred */
  timestamp: Date;
}

/**
 * Worker execution started.
 */
export interface ExecutionStartEvent extends BaseEvent {
  type: "execution_start";
  workerName: string;
  model: string;
}

/**
 * Message being sent to the LLM.
 */
export interface MessageSendEvent extends BaseEvent {
  type: "message_send";
  /** Which iteration of the message loop (1-based) */
  iteration: number;
  /** The messages being sent */
  messages: Array<{
    role: "system" | "user" | "assistant" | "tool";
    content: unknown;
  }>;
  /** Number of tools available */
  toolCount: number;
}

/**
 * Response received from the LLM.
 */
export interface ResponseReceiveEvent extends BaseEvent {
  type: "response_receive";
  iteration: number;
  /** Text content from the response (if any) */
  text?: string;
  /** Tool calls requested by the model */
  toolCalls: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  /** Token usage for this call */
  usage?: {
    input: number;
    output: number;
  };
}

/**
 * Tool execution starting.
 */
export interface ToolCallStartEvent extends BaseEvent {
  type: "tool_call_start";
  iteration: number;
  /** Index of this tool call in the current batch (1-based) */
  toolIndex: number;
  /** Total tool calls in this batch */
  toolTotal: number;
  toolCallId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
}

/**
 * Approval requested for a tool.
 */
export interface ApprovalRequestEvent extends BaseEvent {
  type: "approval_request";
  toolName: string;
  toolArgs: Record<string, unknown>;
  description: string;
}

/**
 * Approval decision made.
 */
export interface ApprovalDecisionEvent extends BaseEvent {
  type: "approval_decision";
  toolName: string;
  approved: boolean;
  cached: boolean;
  remember: "none" | "session";
}

/**
 * Tool execution completed.
 */
export interface ToolCallEndEvent extends BaseEvent {
  type: "tool_call_end";
  iteration: number;
  toolCallId: string;
  toolName: string;
  /** Tool output (may be truncated for display) */
  output: string;
  /** Whether the output was truncated */
  truncated: boolean;
  /** Duration in milliseconds */
  durationMs: number;
}

/**
 * Tool execution failed.
 */
export interface ToolCallErrorEvent extends BaseEvent {
  type: "tool_call_error";
  iteration: number;
  toolCallId: string;
  toolName: string;
  error: string;
}

/**
 * Worker execution completed successfully.
 */
export interface ExecutionEndEvent extends BaseEvent {
  type: "execution_end";
  success: true;
  response: string;
  totalIterations: number;
  totalToolCalls: number;
  totalTokens?: {
    input: number;
    output: number;
  };
  cost?: number;
  durationMs: number;
}

/**
 * Worker execution failed.
 */
export interface ExecutionErrorEvent extends BaseEvent {
  type: "execution_error";
  success: false;
  error: string;
  totalIterations: number;
  totalToolCalls: number;
  durationMs: number;
}

/**
 * Union of all runtime events.
 */
export type RuntimeEvent =
  | ExecutionStartEvent
  | MessageSendEvent
  | ResponseReceiveEvent
  | ToolCallStartEvent
  | ApprovalRequestEvent
  | ApprovalDecisionEvent
  | ToolCallEndEvent
  | ToolCallErrorEvent
  | ExecutionEndEvent
  | ExecutionErrorEvent;

/**
 * Event data without timestamp (for internal use before emit adds timestamp).
 * Uses distributive conditional type to preserve the discriminated union.
 */
export type RuntimeEventData = RuntimeEvent extends infer E
  ? E extends RuntimeEvent
    ? Omit<E, "timestamp">
    : never
  : never;

/**
 * Callback function for receiving runtime events.
 */
export type RuntimeEventCallback = (event: RuntimeEvent) => void;
