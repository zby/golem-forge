/**
 * Worker Definition Schema
 *
 * Re-exports from @golem-forge/core for backwards compatibility.
 * The canonical definitions are now in the core package.
 *
 * @module worker/schema
 */

// Re-export everything from core
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
} from '@golem-forge/core';

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
} from '@golem-forge/core';
