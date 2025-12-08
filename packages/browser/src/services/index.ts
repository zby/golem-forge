/**
 * Services Module
 *
 * Re-exports all browser extension services.
 */

// OPFS Sandbox
export {
  OPFSSandbox,
  createOPFSSandbox,
  createProjectSandbox,
  createSessionSandbox,
  cleanupSessionSandbox,
  SandboxError,
  NotFoundError,
  InvalidPathError,
  type MountSandbox,
  type FileOperations,
  type FileStat,
  type MountSandboxConfig,
  type SubWorkerRestriction,
} from './opfs-sandbox';

// Worker Manager
export {
  WorkerManager,
  workerManager,
  parseWorkerString,
  type WorkerDefinition,
  type WorkerInfo,
  type ParseWorkerResult,
} from './worker-manager';

// AI Service
export {
  BrowserAIService,
  browserAIService,
  parseModelId,
  type ModelInfo,
} from './ai-service';

// Browser Runtime
export {
  BrowserWorkerRuntime,
  createBrowserRuntime,
  type WorkerResult,
  type ApprovalMode,
  type ApprovalRequest,
  type ApprovalDecision,
  type ApprovalCallback,
  type StreamCallback,
  type ToolCallback,
  type BrowserRuntimeOptions,
} from './browser-runtime';
