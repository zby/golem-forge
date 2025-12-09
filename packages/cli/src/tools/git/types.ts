/**
 * Git Integration Types
 *
 * Re-exports platform-agnostic types from @golem-forge/core.
 * CLI-specific types that require Node.js Buffer are defined locally.
 */

import type { z } from 'zod';
import type { StagedCommit } from '@golem-forge/core';
import {
  GitStatusInputSchema,
  GitStageInputSchema,
  GitDiffInputSchema,
  GitPushInputSchema,
  GitDiscardInputSchema,
  GitPullInputSchema,
  GitMergeInputSchema,
  GitBranchesInputSchema,
} from '@golem-forge/core';

// ============================================================================
// Re-exports from @golem-forge/core
// ============================================================================

export {
  // Git targets
  GitHubTargetSchema,
  LocalTargetSchema,
  LocalBareTargetSchema,
  GitTargetSchema,
  // Input schemas
  GitStatusInputSchema,
  GitStageInputSchema,
  GitDiffInputSchema,
  GitPushInputSchema,
  GitDiscardInputSchema,
  GitPullInputSchema,
  GitMergeInputSchema,
  GitBranchesInputSchema,
  // Config schemas
  GitCredentialsConfigSchema,
  GitToolsetConfigSchema,
  // Errors
  GitError,
  GitAuthError,
  // Types
  type BinaryData,
  type GitHubTarget,
  type LocalTarget,
  type LocalBareTarget,
  type GitTarget,
  type StagedFile,
  type StagedCommit,
  type UnstagedFile,
  type GitStatus,
  type PullResult,
  type MergeResult,
  type PushConflict,
  type PushResult,
  type BranchListResult,
  type GitToolResult,
  type GitCredentialsConfig,
  type GitToolsetConfig,
} from '@golem-forge/core';

// ============================================================================
// Input Types (derived from schemas)
// ============================================================================

export type GitStatusInput = z.infer<typeof GitStatusInputSchema>;
export type GitStageInput = z.infer<typeof GitStageInputSchema>;
export type GitDiffInput = z.infer<typeof GitDiffInputSchema>;
export type GitPushInput = z.infer<typeof GitPushInputSchema>;
export type GitDiscardInput = z.infer<typeof GitDiscardInputSchema>;
export type GitPullInput = z.infer<typeof GitPullInputSchema>;
export type GitMergeInput = z.infer<typeof GitMergeInputSchema>;
export type GitBranchesInput = z.infer<typeof GitBranchesInputSchema>;

// ============================================================================
// CLI-Specific Types (require Node.js Buffer)
// ============================================================================

/**
 * Internal representation with file contents.
 * Uses Node.js Buffer for CLI-specific operations (base64 encoding, etc.)
 */
export interface StagedCommitData extends StagedCommit {
  /** File contents keyed by sandbox path */
  contents: Map<string, Buffer>;
}
