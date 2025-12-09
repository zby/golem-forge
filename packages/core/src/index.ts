/**
 * @golem-forge/core
 *
 * Platform-agnostic runtime, types, and utilities for golem-forge.
 * Used by both CLI (Node.js) and browser extension (OPFS) implementations.
 *
 * @module @golem-forge/core
 */

// ============================================================================
// Approval System
// ============================================================================

export {
  BlockedError,
  ApprovalMemory,
  ApprovalController,
  type ApprovalRequest,
  type ApprovalDecision,
  type RememberOption,
  type ApprovalCallback,
  type SecurityContext,
  type ToolApprovalConfig,
  type ApprovalConfig,
  type ApprovalMode,
  type ApprovalControllerOptions,
} from './approval/index.js';

// ============================================================================
// Tool Infrastructure
// ============================================================================

export {
  ToolsetRegistry,
  FilesystemToolset,
  createFilesystemTools,
  createReadFileTool,
  createWriteFileTool,
  createListFilesTool,
  createDeleteFileTool,
  createFileExistsTool,
  createFileInfoTool,
  filesystemToolsetFactory,
  WorkerCallToolset,
  createNamedWorkerTool,
  checkToolNameConflict,
  workerCallToolsetFactory,
  NamedWorkerInputSchema,
  CustomToolset,
  createCustomToolset,
  loadCustomTools,
  wrapWithDefaultApproval,
  createToolFromFunction,
  isNamedTool,
  isZodSchema,
  extractFunctionDescription,
  customToolsetFactory,
  CustomToolsetConfigSchema,
  defaultModuleLoader,
  // Git toolset
  GitToolset,
  createGitTools,
  gitToolsetFactory,
  createGitStatusTool,
  createGitStageTool,
  createGitDiffTool,
  createGitPushTool,
  createGitDiscardTool,
  createGitPullTool,
  createGitMergeTool,
  createGitBranchesTool,
  createGitCheckConflictsTool,
  // Git schemas
  GitHubTargetSchema,
  LocalTargetSchema,
  LocalBareTargetSchema,
  GitTargetSchema,
  GitStatusInputSchema,
  GitStageInputSchema,
  GitDiffInputSchema,
  GitPushInputSchema,
  GitDiscardInputSchema,
  GitPullInputSchema,
  GitMergeInputSchema,
  GitBranchesInputSchema,
  GitCredentialsConfigSchema,
  GitToolsetConfigSchema,
  // Git errors
  GitError,
  GitAuthError,
  // Git merge utilities
  merge,
  threeWayMerge,
  generateDiff,
  generateNewFilePatch,
  generateDeleteFilePatch,
  hasConflictMarkers,
  computeDiffStats,
  type NamedTool,
  type Toolset,
  type ToolsetContext,
  type ToolsetFactory,
  type ExecutionMode,
  type ManualExecutionConfig,
  type FilesystemToolResult,
  type FilesystemToolsetOptions,
  type NamedWorkerInput,
  type CallWorkerResult,
  type WorkerCallToolsetOptions,
  type NamedWorkerToolOptions,
  type CustomToolsetConfig,
  type CustomApprovalConfig,
  type CustomToolsetOptions,
  type ToolContext,
  type ModuleLoader,
  type LoadCustomToolsOptions,
  // Git types
  type GitBackend,
  type GitToolsetOptions,
  type GitToolsetContext,
  type GitToolContext,
  type GitToolOptions,
  type DiffSummary,
  type CreateStagedCommitInput,
  type PushInput,
  type PullInput,
  type BinaryData,
  type GitHubTarget,
  type LocalTarget,
  type LocalBareTarget,
  type GitTarget,
  type StagedFile,
  type StagedCommit,
  type StagedCommitData,
  type UnstagedFile,
  type GitStatus,
  type PullResult,
  type MergeResult,
  type PushConflict,
  type PushResult,
  type BranchListResult,
  type GitToolResult,
  type GitCredentialsConfig,
  type GitToolsetConfig,
  type DiffStats,
  // Isomorphic git backend
  IsomorphicGitBackend,
  createNodeGitBackend,
  type IsomorphicGitBackendOptions,
  type IsomorphicFs,
} from './tools/index.js';

// ============================================================================
// Runtime
// ============================================================================

export {
  ToolExecutor,
  WorkerRuntime,
  createWorkerRuntime,
  defaultWorkerRunnerFactory,
  matchModelPattern,
  type Attachment,
  type InterruptSignal,
  type DelegationContext,
  type CachedWorker,
  type WorkerLookupResult,
  type WorkerResult,
  type RunInput,
  type WorkerRunner,
  type WorkerRegistry,
  type WorkerRunnerOptions,
  type WorkerRunnerFactory,
  type WorkerRuntimeOptionsWithTools,
  type ToolCall,
  type ToolExecutionContext,
  type ToolExecutionResult,
  type ToolExecutorOptions,
  type RuntimeEvent,
  type RuntimeEventData,
  type RuntimeEventCallback,
  type ExecutionStartEvent,
  type MessageSendEvent,
  type ResponseReceiveEvent,
  type ToolCallStartEvent,
  type ApprovalRequestEvent,
  type ApprovalDecisionEvent,
  type ToolCallEndEvent,
  type ToolCallErrorEvent,
  type ExecutionEndEvent,
  type ExecutionErrorEvent,
} from './runtime/index.js';

// ============================================================================
// Sandbox Types
// ============================================================================

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

// ============================================================================
// Worker Schema
// ============================================================================

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
