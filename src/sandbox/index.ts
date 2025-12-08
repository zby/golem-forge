/**
 * Sandbox Module
 *
 * Mount-based filesystem abstraction using Docker bind mount semantics.
 * See docs/sandbox-design.md for design details.
 */

// Shared Types
export type {
  Operation,
  FileStat,
  BackendFileStat,
} from './types.js';

// Errors
export {
  SandboxError,
  NotFoundError,
  InvalidPathError,
  isSandboxError,
} from './errors.js';

// Mount-based Sandbox (Docker-style)
export type {
  FileOperations,
  Mount,
  MountSandboxConfig,
  SubWorkerRestriction,
  ResolvedMount,
  ResolvedMountConfig,
} from './mount-types.js';
export {
  MountSchema,
  MountSandboxConfigSchema,
  SubWorkerRestrictionSchema,
} from './mount-types.js';
export type { MountSandbox } from './mount-sandbox.js';
export {
  MountSandboxImpl,
  createMountSandbox,
  createMountSandboxAsync,
  createTestSandbox,
} from './mount-sandbox.js';

// Re-export FileOperations as Sandbox for simpler imports
export type { FileOperations as Sandbox } from './mount-types.js';
