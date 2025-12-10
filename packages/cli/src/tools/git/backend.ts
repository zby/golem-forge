/**
 * Git Backend Interface
 *
 * Re-exports platform-agnostic backend types from @golem-forge/core.
 * CLI implementations (CLIGitBackend) can use Buffer where BinaryData is expected
 * since Buffer extends Uint8Array.
 */

export type {
  GitBackend,
  CreateStagedCommitInput,
  PushInput,
  PullInput,
  DiffSummary,
} from '@golem-forge/core';
