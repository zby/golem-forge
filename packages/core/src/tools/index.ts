/**
 * Tool Infrastructure
 *
 * Platform-agnostic tool types and registry for golem-forge.
 */

// Base types
export type {
  NamedTool,
  Toolset,
  ToolsetContext,
  ToolsetFactory,
  ExecutionMode,
  ManualExecutionConfig,
} from "./base.js";

// Registry
export { ToolsetRegistry } from "./registry.js";

// Tool info utilities
export { getLLMTools, getManualTools, isLLMTool, isManualTool } from "./tool-info.js";

// Filesystem toolset (self-registers on import)
export {
  FilesystemToolset,
  createFilesystemTools,
  createReadFileTool,
  createWriteFileTool,
  createListFilesTool,
  createDeleteFileTool,
  createFileExistsTool,
  createFileInfoTool,
  filesystemToolsetFactory,
  type FilesystemToolResult,
  type FilesystemToolsetOptions,
} from "./filesystem.js";

// Worker-call toolset (self-registers on import)
export {
  WorkerCallToolset,
  createNamedWorkerTool,
  checkToolNameConflict,
  workerCallToolsetFactory,
  NamedWorkerInputSchema,
  type NamedWorkerInput,
  type CallWorkerResult,
  type WorkerCallToolsetOptions,
  type NamedWorkerToolOptions,
  type DelegationContext,
} from "./worker-call.js";

// Custom toolset (self-registers on import)
export {
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
  type CustomToolsetConfig,
  type CustomApprovalConfig,
  type CustomToolsetOptions,
  type ToolContext,
  type ModuleLoader,
  type LoadCustomToolsOptions,
} from "./custom.js";

// Git toolset (self-registers on import)
export {
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
  // Types
  type GitBackend,
  type GitToolsetOptions,
  type GitToolsetContext,
  type GitToolContext,
  type GitToolOptions,
  type DiffSummary,
  type CreateStagedCommitInput,
  type PushInput,
  type PullInput,
  // Git types
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
  // Schemas
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
  // Errors
  GitError,
  GitAuthError,
  // Merge utilities
  merge,
  threeWayMerge,
  generateDiff,
  generateNewFilePatch,
  generateDeleteFilePatch,
  hasConflictMarkers,
  computeDiffStats,
  type DiffStats,
  // Isomorphic git backend
  IsomorphicGitBackend,
  createNodeGitBackend,
  type IsomorphicGitBackendOptions,
  type IsomorphicFs,
} from "./git/index.js";
