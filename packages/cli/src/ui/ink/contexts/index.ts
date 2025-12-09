/**
 * Context exports for Ink UI
 */

export {
  ThemeProvider,
  useTheme,
  useThemeActions,
  type ThemeProviderProps,
} from "./ThemeContext.js";

export {
  InkUIStateProvider,
  useInkUIState,
  useInkUIStateActions,
  type InkUIStateProviderProps,
  type InkUIState,
  type InputPromptState,
} from "./InkUIStateContext.js";

// Re-export hooks from ui-react for convenience
export {
  EventBusProvider,
  useEventBus,
  useOptionalEventBus,
  MessagesProvider,
  useMessagesState,
  useMessagesActions,
  ApprovalProvider,
  useApprovalState,
  usePendingApproval,
  useApprovalActions,
  WorkerProvider,
  useWorkerState,
  useActiveWorker,
  useWorkerPath,
  useWorkersInOrder,
  useWorkerActions,
  UIStateProvider,
  useUIState,
  useUIMode,
  useUIFocus,
  useUIError,
  useIsInputEnabled,
  useUIStateActions,
  UIProvider,
  // Convenience hooks
  useMessages,
  useConversationMessages,
  useStreaming,
  useLastMessage,
  useRecentMessages,
  useIsAwaitingResponse,
  useCurrentDisplayContent,
  useMessageStats,
  useApprovalStats,
  useHasPendingApproval,
  useSessionApprovals,
  useAlwaysApprovals,
  useApprovalHistory,
  useIsAutoApproved,
  useWorkerList,
  useWorkersAtDepth,
  useWorkerChildren,
  useWorkerStats,
  useHasActiveWorker,
  useRootWorkerId,
} from "@golem-forge/ui-react";
