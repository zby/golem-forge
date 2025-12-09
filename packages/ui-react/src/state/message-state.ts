/**
 * Message State Management
 *
 * Platform-agnostic state management for conversation history.
 * Includes messages, tool results, status updates, and streaming.
 * Pure functions that return new state objects for immutability.
 *
 * @module @golem-forge/ui-react/state/message-state
 */

import type {
  Message,
  MessageRole,
  StatusType,
  ToolResultStatus,
  ToolResultValue,
} from '@golem-forge/core';

// Re-export Message for consumers
export type { Message };

// ============================================================================
// Types
// ============================================================================

/**
 * Status update for display
 */
export interface StatusUpdate {
  type: StatusType;
  message: string;
}

/**
 * Tool result data for display
 */
export interface ToolResultData {
  toolName: string;
  toolCallId: string;
  status: ToolResultStatus;
  summary?: string;
  error?: string;
  durationMs: number;
}

/**
 * Extended message types for the UI timeline
 */
export type UIMessage =
  | { type: 'message'; message: Message }
  | { type: 'tool_result'; result: ToolResultData }
  | { type: 'status'; status: StatusUpdate }
  | { type: 'worker_start'; workerId: string; task: string }
  | { type: 'worker_complete'; workerId: string; success: boolean };

/**
 * Message state
 */
export interface MessageState {
  /** All messages in timeline order */
  messages: UIMessage[];
  /** Current streaming content (null if not streaming) */
  streamingContent: string | null;
  /** Whether currently streaming */
  isStreaming: boolean;
  /** Current streaming request ID (for correlation) */
  streamingRequestId: string | null;
}

/**
 * Statistics about message state
 */
export interface MessageStats {
  total: number;
  messages: number;
  toolResults: number;
  statuses: number;
  workerEvents: number;
}

// ============================================================================
// State Creation
// ============================================================================

/**
 * Create initial message state.
 */
export function createMessageState(): MessageState {
  return {
    messages: [],
    streamingContent: null,
    isStreaming: false,
    streamingRequestId: null,
  };
}

// ============================================================================
// Message Operations
// ============================================================================

/**
 * Add a conversation message.
 */
export function addMessage(state: MessageState, message: Message): MessageState {
  const uiMessage: UIMessage = { type: 'message', message };
  return {
    ...state,
    messages: [...state.messages, uiMessage],
  };
}

/**
 * Add a message from display event data.
 * @deprecated Use addMessage directly - Message type is now unified
 */
export function addDisplayMessage(
  state: MessageState,
  message: Message
): MessageState {
  return addMessage(state, message);
}

/**
 * Add a tool result.
 */
export function addToolResult(
  state: MessageState,
  result: ToolResultData
): MessageState {
  const uiMessage: UIMessage = { type: 'tool_result', result };
  return {
    ...state,
    messages: [...state.messages, uiMessage],
  };
}

/**
 * Well-known result kinds for type checking.
 */
const WELL_KNOWN_KINDS = ['text', 'diff', 'file_content', 'file_list', 'json'] as const;

/**
 * Check if a kind is a well-known kind.
 */
function isWellKnownKind(kind: string): kind is typeof WELL_KNOWN_KINDS[number] {
  return (WELL_KNOWN_KINDS as readonly string[]).includes(kind);
}

/**
 * Generate summary from a ToolResultValue.
 * Uses value.summary if available, otherwise generates based on kind.
 */
function generateSummary(value: ToolResultValue): string | undefined {
  // Check if value has a summary field first
  if ('summary' in value && typeof value.summary === 'string') {
    return value.summary;
  }

  // Fall back to generated summary based on kind
  if (!isWellKnownKind(value.kind)) {
    // Custom result type
    return `Custom result (${value.kind})`;
  }

  // Handle well-known kinds with type-safe access
  switch (value.kind) {
    case 'text': {
      const text = value as { kind: 'text'; content: string };
      return text.content.length > 100
        ? text.content.substring(0, 100) + '...'
        : text.content;
    }
    case 'diff': {
      const diff = value as { kind: 'diff'; path: string };
      return `Modified ${diff.path}`;
    }
    case 'file_content': {
      const fc = value as { kind: 'file_content'; path: string; size: number };
      return `Read ${fc.path} (${fc.size} bytes)`;
    }
    case 'file_list': {
      const fl = value as { kind: 'file_list'; path: string; count: number };
      return `Listed ${fl.count} entries in ${fl.path}`;
    }
    case 'json':
      return 'Structured data';
    default:
      return undefined;
  }
}

/**
 * Add a tool result from event data.
 */
export function addToolResultFromEvent(
  state: MessageState,
  toolCallId: string,
  toolName: string,
  status: ToolResultStatus,
  durationMs: number,
  value?: ToolResultValue,
  error?: string
): MessageState {
  const summary = value ? generateSummary(value) : undefined;

  const result: ToolResultData = {
    toolCallId,
    toolName,
    status,
    summary,
    error,
    durationMs,
  };

  return addToolResult(state, result);
}

/**
 * Add a status update.
 */
export function addStatus(state: MessageState, status: StatusUpdate): MessageState {
  const uiMessage: UIMessage = { type: 'status', status };
  return {
    ...state,
    messages: [...state.messages, uiMessage],
  };
}

/**
 * Add a worker start event.
 */
export function addWorkerStart(
  state: MessageState,
  workerId: string,
  task: string
): MessageState {
  const uiMessage: UIMessage = { type: 'worker_start', workerId, task };
  return {
    ...state,
    messages: [...state.messages, uiMessage],
  };
}

/**
 * Add a worker complete event.
 */
export function addWorkerComplete(
  state: MessageState,
  workerId: string,
  success: boolean
): MessageState {
  const uiMessage: UIMessage = { type: 'worker_complete', workerId, success };
  return {
    ...state,
    messages: [...state.messages, uiMessage],
  };
}

// ============================================================================
// Streaming Operations
// ============================================================================

/**
 * Start streaming with initial content.
 */
export function startStreaming(
  state: MessageState,
  requestId: string,
  initialContent: string = ''
): MessageState {
  return {
    ...state,
    streamingContent: initialContent,
    isStreaming: true,
    streamingRequestId: requestId,
  };
}

/**
 * Append content to current stream.
 */
export function appendStreaming(
  state: MessageState,
  delta: string
): MessageState {
  if (!state.isStreaming) {
    return state;
  }

  return {
    ...state,
    streamingContent: (state.streamingContent || '') + delta,
  };
}

/**
 * Update streaming from event data.
 * Handles starting, appending, and committing based on event.
 */
export function updateStreamingFromEvent(
  state: MessageState,
  requestId: string,
  delta: string,
  done: boolean
): MessageState {
  // If not streaming yet, start
  if (!state.isStreaming || state.streamingRequestId !== requestId) {
    state = startStreaming(state, requestId, '');
  }

  // Append delta
  state = appendStreaming(state, delta);

  // If done, commit
  if (done) {
    state = commitStreaming(state);
  }

  return state;
}

/**
 * Commit streaming content as a message and clear streaming state.
 */
export function commitStreaming(state: MessageState): MessageState {
  if (!state.streamingContent) {
    return {
      ...state,
      streamingContent: null,
      isStreaming: false,
      streamingRequestId: null,
    };
  }

  const message: Message = {
    role: 'assistant',
    content: state.streamingContent,
    timestamp: Date.now(),
  };

  return {
    ...state,
    messages: [...state.messages, { type: 'message', message }],
    streamingContent: null,
    isStreaming: false,
    streamingRequestId: null,
  };
}

/**
 * Cancel streaming without committing.
 */
export function cancelStreaming(state: MessageState): MessageState {
  return {
    ...state,
    streamingContent: null,
    isStreaming: false,
    streamingRequestId: null,
  };
}

// ============================================================================
// Clear Operations
// ============================================================================

/**
 * Clear all messages and reset state.
 */
export function clearMessages(): MessageState {
  return createMessageState();
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Get only conversation messages (excluding tool results, status, etc.).
 */
export function getConversationMessages(state: MessageState): Message[] {
  return state.messages
    .filter((m): m is { type: 'message'; message: Message } => m.type === 'message')
    .map((m) => m.message);
}

/**
 * Get the last message by role.
 */
export function getLastMessageByRole(
  state: MessageState,
  role: MessageRole
): Message | undefined {
  const messages = getConversationMessages(state);
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === role) {
      return messages[i];
    }
  }
  return undefined;
}

/**
 * Get the last N messages.
 */
export function getRecentMessages(
  state: MessageState,
  count: number
): UIMessage[] {
  return state.messages.slice(-count);
}

/**
 * Check if awaiting response (last message is from user).
 */
export function isAwaitingResponse(state: MessageState): boolean {
  const lastMessage = getLastMessageByRole(state, 'user');
  const lastAssistant = getLastMessageByRole(state, 'assistant');

  if (!lastMessage) {
    return false;
  }

  // Awaiting if last user message is newer than last assistant message
  if (!lastAssistant) {
    return true;
  }

  const userTime = lastMessage.timestamp || 0;
  const assistantTime = lastAssistant.timestamp || 0;

  return userTime > assistantTime;
}

/**
 * Get current display content (streaming or last message).
 */
export function getCurrentDisplayContent(state: MessageState): string | null {
  if (state.isStreaming && state.streamingContent) {
    return state.streamingContent;
  }

  const lastAssistant = getLastMessageByRole(state, 'assistant');
  return lastAssistant?.content || null;
}

// ============================================================================
// Statistics
// ============================================================================

/**
 * Get statistics about message state.
 */
export function getMessageStats(state: MessageState): MessageStats {
  let messages = 0;
  let toolResults = 0;
  let statuses = 0;
  let workerEvents = 0;

  for (const msg of state.messages) {
    switch (msg.type) {
      case 'message':
        messages++;
        break;
      case 'tool_result':
        toolResults++;
        break;
      case 'status':
        statuses++;
        break;
      case 'worker_start':
      case 'worker_complete':
        workerEvents++;
        break;
    }
  }

  return {
    total: state.messages.length,
    messages,
    toolResults,
    statuses,
    workerEvents,
  };
}
