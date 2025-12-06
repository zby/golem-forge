/**
 * Tool execution with approval support
 */

export {
  FilesystemToolset,
  createFilesystemTools,
  createReadFileTool,
  createWriteFileTool,
  createListFilesTool,
  createDeleteFileTool,
  createFileExistsTool,
  createFileInfoTool,
  type FilesystemToolResult,
  type FilesystemToolsetOptions,
  type NamedTool,
  type ZoneApprovalMap,
} from "./filesystem.js";

export {
  WorkerCallToolset,
  createCallWorkerTool,
  createNamedWorkerTool,
  checkToolNameConflict,
  type CallWorkerInput,
  type NamedWorkerInput,
  type CallWorkerResult,
  type DelegationContext,
  type WorkerCallToolsetOptions,
  type NamedWorkerToolOptions,
} from "./worker-call.js";

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
