/**
 * Hooks
 *
 * Convenience hooks for accessing state and derived values.
 *
 * @module @golem-forge/ui-react/hooks
 */

// EventBus hooks
export { useEventBus, useOptionalEventBus } from './useEventBus.js';

// Message hooks
export {
  useMessagesState,
  useMessagesActions,
  useMessages,
  useConversationMessages,
  useStreaming,
  useLastMessage,
  useRecentMessages,
  useIsAwaitingResponse,
  useCurrentDisplayContent,
  useMessageStats,
} from './useMessages.js';

// Approval hooks
export {
  useApprovalState,
  usePendingApproval,
  useApprovalActions,
  useApprovalStats,
  useHasPendingApproval,
  useSessionApprovals,
  useAlwaysApprovals,
  useApprovalHistory,
  useIsAutoApproved,
} from './useApproval.js';

// Worker hooks
export {
  useWorkerState,
  useActiveWorker,
  useWorkerPath,
  useWorkersInOrder,
  useWorkerActions,
  useWorkerList,
  useWorkersAtDepth,
  useWorkerChildren,
  useWorkerStats,
  useHasActiveWorker,
  useRootWorkerId,
} from './useWorkers.js';

// UIState hooks
export {
  useUIState,
  useUIMode,
  useUIFocus,
  useUIError,
  useIsInputEnabled,
  useUIStateActions,
} from './useUIState.js';
export type { UIMode, UIFocus } from './useUIState.js';
