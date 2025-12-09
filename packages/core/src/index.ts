/**
 * @golem-forge/core
 *
 * Platform-agnostic types and utilities for golem-forge.
 * Used by both CLI (Node.js) and browser extension (OPFS) implementations.
 *
 * @module @golem-forge/core
 */

// Sandbox types
export type {
  FileStat,
  FileOperations,
  Mount,
  MountSandboxConfig,
  SubWorkerRestriction,
  ResolvedMount,
  ResolvedMountConfig,
  MountSandbox,
} from './sandbox-types.js';

// Sandbox errors
export {
  SandboxError,
  NotFoundError,
  InvalidPathError,
  ReadOnlyError,
  PermissionEscalationError,
  isSandboxError,
} from './sandbox-errors.js';

// Worker schema
export {
  ApprovalDecisionTypeSchema,
  PathApprovalConfigSchema,
  WorkerSandboxConfigSchema,
  AttachmentPolicySchema,
  ServerSideToolConfigSchema,
  ToolsetsConfigSchema,
  WorkerFrontmatterSchema,
  WorkerDefinitionSchema,
  formatParseError,
} from './worker-schema.js';

export type {
  ApprovalDecisionType,
  PathApprovalConfig,
  WorkerSandboxConfig,
  AttachmentPolicy,
  ServerSideToolConfig,
  ToolsetsConfig,
  WorkerFrontmatter,
  WorkerDefinition,
  ParseResult,
  ParseError,
  ParseWorkerResult,
} from './worker-schema.js';

// ============================================================================
// UI Interface (Event-Driven Architecture)
// ============================================================================

// UI Events - types for event-driven communication
export type {
  // Base types
  MessageRole,
  DisplayMessage,
  ApprovalRisk,
  ApprovalType,
  WorkerStatus,
  WorkerInfo,
  StatusType,
  ToolResultStatus,
  // Display events (runtime -> UI)
  MessageEvent,
  StreamingEvent,
  StatusEvent,
  ToolStartedEvent,
  ToolResultEvent,
  ToolResultValueEvent,
  WorkerUpdateEvent,
  ApprovalRequiredEvent,
  ManualToolsAvailableEvent,
  ManualToolInfoEvent,
  ManualToolFieldEvent,
  DiffSummaryEvent,
  DiffFileSummary,
  DiffContentEvent,
  InputPromptEvent,
  SessionEndEvent,
  // Action events (UI -> runtime)
  UserInputEvent,
  ApprovalResponseEvent,
  ManualToolInvokeEvent,
  InterruptEvent,
  GetDiffEvent,
  // Event maps
  DisplayEvents,
  ActionEvents,
  AllEvents,
  EventName,
  Unsubscribe,
} from './ui-events.js';

// UI Event Bus - core communication mechanism
export type { UIEventBus, EventHandler } from './ui-event-bus.js';
export { createUIEventBus } from './ui-event-bus.js';

// Runtime UI - high-level convenience wrapper
export type {
  RuntimeUI,
  ApprovalOptions,
  ApprovalResult,
  InputOptions,
} from './runtime-ui.js';
export { createRuntimeUI } from './runtime-ui.js';

// UI Implementation - interface for UI implementations
export type { UIImplementation } from './ui-implementation.js';
export { BaseUIImplementation } from './ui-implementation.js';

// ============================================================================
// UI State Management (Platform-Agnostic)
// ============================================================================

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
} from './worker-state.js';

// Message state
export type {
  Message,
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
