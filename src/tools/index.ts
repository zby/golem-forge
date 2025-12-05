/**
 * Tool execution with approval support
 */

export {
  ApprovedExecutor,
  type ApprovalToolset,
  type ApprovedExecutorOptions,
  type ApprovedExecuteResult,
} from "./approved-executor.js";

export {
  FilesystemToolset,
  createFilesystemTools,
  createReadFileTool,
  createWriteFileTool,
  createListFilesTool,
  createDeleteFileTool,
  createStageForCommitTool,
  createFileExistsTool,
  createFileInfoTool,
  type FilesystemToolResult,
} from "./filesystem.js";
