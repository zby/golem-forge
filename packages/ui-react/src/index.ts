/**
 * @golem-forge/ui-react
 *
 * Shared React contexts, hooks, and state management for golem-forge UIs.
 * Use this package to build React-based interfaces (Ink terminal, browser, etc.)
 * that connect to the golem-forge event system.
 *
 * @module @golem-forge/ui-react
 */

// ============================================================================
// State Management
// ============================================================================
// Pure functions for state management. These can be used independently
// of React contexts if needed.

// Message state
export type {
  StatusUpdate,
  ToolResultData,
  UIMessage,
  MessageState,
  MessageStats,
} from './state/message-state.js';
export {
  createMessageState,
  addMessage,
  addDisplayMessage,
  addToolResult,
  addToolResultFromEvent,
  addStatus,
  addWorkerStart,
  addWorkerComplete,
  startStreaming,
  appendStreaming,
  updateStreamingFromEvent,
  commitStreaming,
  cancelStreaming,
  clearMessages,
  getConversationMessages,
  getLastMessageByRole,
  getRecentMessages,
  isAwaitingResponse,
  getCurrentDisplayContent,
  getMessageStats,
} from './state/message-state.js';

// Approval state
export type {
  ApprovalPattern,
  ApprovalRequestData,
  ApprovalResultData,
  ApprovalHistoryEntry,
  ApprovalState,
  ApprovalStats,
} from './state/approval-state.js';
export {
  compareRisk,
  isRiskAtOrBelow,
  createApprovalState,
  matchesApprovalPattern,
  findMatchingPattern,
  isAutoApproved,
  createPatternFromRequest,
  addApproval,
  addSessionApproval,
  addAlwaysApproval,
  clearSessionApprovals,
  clearApprovalHistory,
  removeAlwaysApproval,
  getApprovalStats,
} from './state/approval-state.js';

// Worker state
export type {
  WorkerNode,
  TaskProgress,
  WorkerState,
  WorkerStats,
} from './state/worker-state.js';
export {
  createWorkerState,
  workerFromProgress,
  addWorker,
  updateWorkerStatus,
  setActiveWorker,
  removeWorker,
  updateFromProgress,
  clearWorkers,
  getWorkerPath,
  getActiveWorker,
  getWorkerList,
  getWorkersInTreeOrder,
  getWorkersAtDepth,
  getWorkerChildren,
  getWorkerStats,
} from './state/worker-state.js';

// ============================================================================
// React Contexts
// ============================================================================

// EventBus Context
export {
  EventBusProvider,
  useEventBus,
  useOptionalEventBus,
} from './contexts/EventBusContext.js';
export type { EventBusProviderProps } from './contexts/EventBusContext.js';

// Messages Context
export {
  MessagesProvider,
  useMessagesState,
  useMessagesActions,
} from './contexts/MessagesContext.js';
export type { MessagesProviderProps } from './contexts/MessagesContext.js';

// Approval Context
export {
  ApprovalProvider,
  useApprovalState,
  usePendingApproval,
  useApprovalActions,
} from './contexts/ApprovalContext.js';
export type { ApprovalProviderProps } from './contexts/ApprovalContext.js';

// Worker Context
export {
  WorkerProvider,
  useWorkerState,
  useActiveWorker,
  useWorkerPath,
  useWorkersInOrder,
  useWorkerActions,
} from './contexts/WorkerContext.js';
export type { WorkerProviderProps } from './contexts/WorkerContext.js';

// UIState Context
export {
  UIStateProvider,
  useUIState,
  useUIMode,
  useUIFocus,
  useUIError,
  useIsInputEnabled,
  useUIStateActions,
} from './contexts/UIStateContext.js';
export type { UIStateProviderProps, UIMode, UIFocus } from './contexts/UIStateContext.js';

// ============================================================================
// Convenience Hooks
// ============================================================================

// Message hooks
export {
  useMessages,
  useConversationMessages,
  useStreaming,
  useLastMessage,
  useRecentMessages,
  useIsAwaitingResponse,
  useCurrentDisplayContent,
  useMessageStats,
} from './hooks/useMessages.js';

// Approval hooks
export {
  useApprovalStats,
  useHasPendingApproval,
  useSessionApprovals,
  useAlwaysApprovals,
  useApprovalHistory,
  useIsAutoApproved,
} from './hooks/useApproval.js';

// Worker hooks
export {
  useWorkerList,
  useWorkersAtDepth,
  useWorkerChildren,
  useWorkerStats,
  useHasActiveWorker,
  useRootWorkerId,
} from './hooks/useWorkers.js';

// ============================================================================
// Combined Provider
// ============================================================================

export { UIProvider } from './providers/UIProvider.js';
export type { UIProviderProps } from './providers/UIProvider.js';
