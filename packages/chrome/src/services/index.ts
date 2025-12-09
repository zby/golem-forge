/**
 * Services Module
 *
 * Re-exports all browser extension services.
 */

// OPFS Sandbox
export {
  OPFSSandbox,
  createOPFSSandbox,
  createProgramSandbox,
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

// Chrome Adapter (Event-based UI bridge)
export {
  ChromeAdapter,
  createChromeAdapter,
  type ChromeAdapterOptions,
  type WorkerExecutionState,
} from './chrome-adapter';

// OPFS Git Adapter (for isomorphic-git integration)
export {
  createOPFSGitAdapter,
  createSandboxGitAdapter,
} from './opfs-git-adapter';

// Browser Worker Registry (for worker delegation)
export {
  BrowserWorkerRegistry,
  createBrowserWorkerRegistry,
  bundledWorkerRegistry,
} from './browser-worker-registry';

// Browser Module Loader (for custom tools)
export {
  browserModuleLoader,
  bundledModules,
  createModuleLoader,
  registerModule,
  registerModules,
} from './browser-module-loader';
