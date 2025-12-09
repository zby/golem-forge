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

// Frontmatter parser
export { parseFrontmatter } from './frontmatter.js';
export type { FrontmatterResult } from './frontmatter.js';

// Worker parser
export { parseWorkerString } from './worker-parser.js';

// ============================================================================
// UI Interface (Event-Driven Architecture)
// ============================================================================

// UI Events - types for event-driven communication
export type {
  // Base types
  MessageRole,
  Message,
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
  // Tool result types
  DisplayHints,
  WellKnownKind,
  ToolResultValue,
  WellKnownResultValue,
  TextResultValue,
  DiffResultValue,
  FileContentResultValue,
  FileListResultValue,
  JsonResultValue,
  CustomResultValue,
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
// NOTE: State management functions have been moved to @golem-forge/ui-react
// Import from '@golem-forge/ui-react' for state management functionality
