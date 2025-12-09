/**
 * React Contexts
 *
 * Contexts for sharing state across the component tree.
 *
 * @module @golem-forge/ui-react/contexts
 */

// EventBus Context
export {
  EventBusProvider,
  useEventBus,
  useOptionalEventBus,
} from './EventBusContext.js';
export type { EventBusProviderProps } from './EventBusContext.js';

// Messages Context
export {
  MessagesProvider,
  useMessagesState,
  useMessagesActions,
} from './MessagesContext.js';
export type { MessagesProviderProps } from './MessagesContext.js';

// Approval Context
export {
  ApprovalProvider,
  useApprovalState,
  usePendingApproval,
  useApprovalActions,
} from './ApprovalContext.js';
export type { ApprovalProviderProps } from './ApprovalContext.js';

// Worker Context
export {
  WorkerProvider,
  useWorkerState,
  useActiveWorker,
  useWorkerPath,
  useWorkersInOrder,
  useWorkerActions,
} from './WorkerContext.js';
export type { WorkerProviderProps } from './WorkerContext.js';

// UIState Context
export {
  UIStateProvider,
  useUIState,
  useUIMode,
  useUIFocus,
  useUIError,
  useIsInputEnabled,
  useUIStateActions,
} from './UIStateContext.js';
export type { UIStateProviderProps, UIMode, UIFocus } from './UIStateContext.js';
