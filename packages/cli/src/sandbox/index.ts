/**
 * Sandbox Module
 *
 * Mount-based filesystem abstraction using Docker bind mount semantics.
 * See docs/sandbox-design.md for design details.
 *
 * Type definitions are in @golem-forge/core for cross-platform reuse.
 */

// Shared Types (re-exported for convenience)
export type {
  FileStat,
  FileOperations,
  Mount,
  MountSandboxConfig,
  SubWorkerRestriction,
  ResolvedMount,
  ResolvedMountConfig,
  MountSandbox,
} from './mount-types.js';

// CLI-specific types
export type {
  Operation,
  BackendFileStat,
} from './types.js';

// Errors (from shared module)
export {
  SandboxError,
  NotFoundError,
  InvalidPathError,
  ReadOnlyError,
  PermissionEscalationError,
  isSandboxError,
} from './errors.js';

// Zod Schemas
export {
  MountSchema,
  MountSandboxConfigSchema,
  SubWorkerRestrictionSchema,
} from './mount-types.js';

// Implementation (Node.js specific)
export {
  MountSandboxImpl,
  createMountSandbox,
  createMountSandboxAsync,
  createTestSandbox,
} from './mount-sandbox.js';

// Re-export FileOperations as Sandbox for simpler imports
export type { FileOperations as Sandbox } from './mount-types.js';
