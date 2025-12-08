/**
 * @golem-forge/core
 *
 * Platform-agnostic types and utilities for golem-forge.
 * Used by both CLI (Node.js) and browser extension (OPFS) implementations.
 *
 * @module @golem-forge/core
 */

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
