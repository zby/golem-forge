/**
 * Message Hooks
 *
 * Convenience hooks for accessing message state and derived values.
 *
 * @module @golem-forge/ui-react/hooks/useMessages
 */

import { useMessagesState, useMessagesActions } from '../contexts/MessagesContext.js';
import type { Message, UIMessage } from '../state/message-state.js';
import {
  getConversationMessages,
  getLastMessageByRole,
  getRecentMessages,
  isAwaitingResponse,
  getCurrentDisplayContent,
  getMessageStats,
} from '../state/message-state.js';

// Re-export context hooks
export { useMessagesState, useMessagesActions };

/**
 * Hook to get all messages in the timeline.
 */
export function useMessages(): UIMessage[] {
  const state = useMessagesState();
  return state.messages;
}

/**
 * Hook to get only conversation messages (excluding tool results, etc.).
 */
export function useConversationMessages(): Message[] {
  const state = useMessagesState();
  return getConversationMessages(state);
}

/**
 * Hook to get the streaming state.
 */
export function useStreaming() {
  const state = useMessagesState();
  return {
    content: state.streamingContent,
    isStreaming: state.isStreaming,
    requestId: state.streamingRequestId,
  };
}

/**
 * Hook to get the last message by role.
 */
export function useLastMessage(role: 'user' | 'assistant' | 'system'): Message | undefined {
  const state = useMessagesState();
  return getLastMessageByRole(state, role);
}

/**
 * Hook to get recent messages.
 */
export function useRecentMessages(count: number): UIMessage[] {
  const state = useMessagesState();
  return getRecentMessages(state, count);
}

/**
 * Hook to check if awaiting a response from the assistant.
 */
export function useIsAwaitingResponse(): boolean {
  const state = useMessagesState();
  return isAwaitingResponse(state);
}

/**
 * Hook to get current display content (streaming or last message).
 */
export function useCurrentDisplayContent(): string | null {
  const state = useMessagesState();
  return getCurrentDisplayContent(state);
}

/**
 * Hook to get message statistics.
 */
export function useMessageStats() {
  const state = useMessagesState();
  return getMessageStats(state);
}
