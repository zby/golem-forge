/**
 * Tool execution with approval support
 */

// Registry (re-exported from core for convenience)
export { ToolsetRegistry, type ToolsetContext, type ToolsetFactory, type NamedTool, type ExecutionMode, type ManualExecutionConfig } from "./registry.js";

// Filesystem toolset (re-exported from core - platform-agnostic)
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
} from "@golem-forge/core";

// Worker-call toolset (re-exported from core - platform-agnostic)
export {
  WorkerCallToolset,
  createNamedWorkerTool,
  checkToolNameConflict,
  workerCallToolsetFactory,
  NamedWorkerInputSchema,
  type NamedWorkerInput,
  type CallWorkerResult,
  type DelegationContext,
  type WorkerCallToolsetOptions,
  type NamedWorkerToolOptions,
} from "@golem-forge/core";

export {
  ShellToolset,
  createShellTool,
  createShellTools,
  executeShell,
  parseCommand,
  checkMetacharacters,
  matchShellRules,
  ShellError,
  ShellBlockedError,
  ShellConfigSchema,
  ShellRuleSchema,
  ShellDefaultSchema,
  BLOCKED_METACHARACTERS,
  MAX_OUTPUT_BYTES,
  DEFAULT_TIMEOUT,
  MAX_TIMEOUT,
  type ShellResult,
  type ShellRule,
  type ShellDefault,
  type ShellConfig,
  type ShellToolOptions,
  type ShellToolsetOptions,
  type MatchResult,
} from "./shell.js";

// Custom toolset (re-exported from core - platform-agnostic)
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
} from "@golem-forge/core";

// Git toolset (self-registers on import)
export {
  GitToolset,
  GitError,
  GitAuthError,
  GitTargetSchema,
  GitToolsetConfigSchema,
  CLIGitBackend,
  createCLIGitBackend,
  getGitHubAuth,
  hasGitHubAuth,
  merge,
  threeWayMerge,
  generateDiff,
  hasConflictMarkers,
  createGitTools,
  createGitStatusTool,
  createGitStageTool,
  createGitDiffTool,
  createGitPushTool,
  createGitDiscardTool,
  createGitPullTool,
  createGitMergeTool,
  createGitBranchesTool,
  type GitTarget,
  type GitHubTarget,
  type LocalTarget,
  type LocalBareTarget,
  type StagedCommit,
  type StagedFile,
  type GitStatus,
  type UnstagedFile,
  type PullResult,
  type MergeResult,
  type PushResult,
  type PushConflict,
  type BranchListResult,
  type GitToolsetConfig,
  type GitToolResult,
  type GitBackend,
  type GitToolsetOptions,
} from "./git/index.js";
