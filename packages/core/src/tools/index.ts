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
