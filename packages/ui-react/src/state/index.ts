/**
 * State Management
 *
 * Pure state functions for UI state management.
 * All functions are platform-agnostic and return new state objects.
 *
 * @module @golem-forge/ui-react/state
 */

// Message state
export type {
  StatusUpdate,
  ToolResultData,
  UIMessage,
  MessageState,
  MessageStats,
} from './message-state.js';
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
} from './message-state.js';

// Approval state
export type {
  ApprovalPattern,
  ApprovalRequestData,
  ApprovalResultData,
  ApprovalHistoryEntry,
  ApprovalState,
  ApprovalStats,
} from './approval-state.js';
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
} from './approval-state.js';

// Worker state
export type {
  WorkerNode,
  TaskProgress,
  WorkerState,
  WorkerStats,
} from './worker-state.js';
export {
  createWorkerState,
  workerFromProgress,
  addWorker,
  updateWorkerStatus,
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
} from './worker-state.js';
