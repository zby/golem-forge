/**
 * Git Integration Types
 *
 * Type definitions for git tools, targets, and operations.
 */

import { z } from 'zod';

// ============================================================================
// Git Targets
// ============================================================================

/**
 * GitHub remote target.
 */
export interface GitHubTarget {
  type: 'github';
  /** Repository in format "owner/repo" */
  repo: string;
  /** Branch name. Defaults to repository's default branch. */
  branch?: string;
}

/**
 * Local git repository target (working tree).
 */
export interface LocalTarget {
  type: 'local';
  /** Path to the git repository (can be relative to project root or absolute) */
  path: string;
  /** Branch name. Defaults to current branch. */
  branch?: string;
}

/**
 * Bare local repository target.
 */
export interface LocalBareTarget {
  type: 'local-bare';
  /** Path to the bare repository */
  path: string;
}

/**
 * Union type for all git targets.
 */
export type GitTarget = GitHubTarget | LocalTarget | LocalBareTarget;

// ============================================================================
// Zod Schemas for Git Targets
// ============================================================================

export const GitHubTargetSchema = z.object({
  type: z.literal('github'),
  repo: z.string().regex(/^[^/]+\/[^/]+$/, 'Repository must be in format "owner/repo"'),
  branch: z.string().optional(),
});

export const LocalTargetSchema = z.object({
  type: z.literal('local'),
  path: z.string(),
  branch: z.string().optional(),
});

export const LocalBareTargetSchema = z.object({
  type: z.literal('local-bare'),
  path: z.string(),
});

export const GitTargetSchema = z.discriminatedUnion('type', [
  GitHubTargetSchema,
  LocalTargetSchema,
  LocalBareTargetSchema,
]);

// ============================================================================
// Staged Commits
// ============================================================================

/**
 * A file staged for commit.
 */
export interface StagedFile {
  /** Path within the sandbox (e.g., /src/report.md) */
  sandboxPath: string;
  /** Type of operation */
  operation: 'create' | 'update' | 'delete';
  /** SHA-256 hash of content (for verification) */
  contentHash: string;
  /** File size in bytes */
  size: number;
}

/**
 * A staged commit waiting to be pushed.
 */
export interface StagedCommit {
  /** Unique identifier for this staged commit */
  id: string;
  /** Commit message */
  message: string;
  /** Files included in this commit */
  files: StagedFile[];
  /** When this commit was staged */
  createdAt: Date;
}

/**
 * Internal representation with file contents.
 */
export interface StagedCommitData extends StagedCommit {
  /** File contents keyed by sandbox path */
  contents: Map<string, Buffer>;
}

// ============================================================================
// Git Status
// ============================================================================

/**
 * Status of an unstaged file in the sandbox.
 */
export interface UnstagedFile {
  /** Path within the sandbox */
  path: string;
  /** File status */
  status: 'new' | 'modified' | 'deleted';
}

/**
 * Status of the sandbox and staged commits.
 */
export interface GitStatus {
  /** Commits staged and ready for push */
  staged: StagedCommit[];
  /** Files in sandbox not yet staged */
  unstaged: UnstagedFile[];
}

// ============================================================================
// Operation Results
// ============================================================================

/**
 * Result of a pull operation.
 */
export interface PullResult {
  /** All paths written to sandbox */
  pulled: string[];
  /** Paths with conflict markers (subset of pulled) */
  conflicts: string[];
}

/**
 * Result of a merge operation.
 */
export interface MergeResult {
  /** Whether merge was clean */
  status: 'clean' | 'conflict';
  /** Merged content (may include conflict markers) */
  content: string;
}

/**
 * Conflict information for a failed push.
 */
export interface PushConflict {
  /** Reason for conflict */
  reason: 'non-fast-forward' | 'other';
  /** Human-readable explanation */
  message: string;
  /** Current HEAD of target (for non-fast-forward) */
  targetHead?: string;
}

/**
 * Result of a push operation.
 */
export interface PushResult {
  /** Whether push succeeded */
  status: 'success' | 'conflict';
  /** Commit SHA on success */
  commitSha?: string;
  /** Conflict details on failure */
  conflict?: PushConflict;
}

/**
 * Branch listing result.
 */
export interface BranchListResult {
  /** Available branches */
  branches: string[];
  /** Currently checked out branch (for local repos) */
  current?: string;
}

// ============================================================================
// Tool Input Schemas
// ============================================================================

export const GitStatusInputSchema = z.object({});
export type GitStatusInput = z.infer<typeof GitStatusInputSchema>;

export const GitStageInputSchema = z.object({
  files: z.array(z.string()).describe('Sandbox paths to stage (e.g., ["/src/report.md"])'),
  message: z.string().describe('Commit message for this staged commit'),
});
export type GitStageInput = z.infer<typeof GitStageInputSchema>;

export const GitDiffInputSchema = z.object({
  commitId: z.string().optional().describe('Show diff for specific staged commit. If omitted, shows all staged changes.'),
});
export type GitDiffInput = z.infer<typeof GitDiffInputSchema>;

export const GitPushInputSchema = z.object({
  commitId: z.string().describe('ID of the staged commit to push'),
  target: GitTargetSchema.describe('Git target (GitHub, local repo, or bare repo)'),
});
export type GitPushInput = z.infer<typeof GitPushInputSchema>;

export const GitDiscardInputSchema = z.object({
  commitId: z.string().describe('ID of the staged commit to discard'),
});
export type GitDiscardInput = z.infer<typeof GitDiscardInputSchema>;

export const GitPullInputSchema = z.object({
  source: GitTargetSchema.describe('Git source to pull from'),
  paths: z.array(z.string()).describe('Paths to pull from the source'),
  destPath: z.string().optional().describe('Destination path prefix in sandbox (e.g., "/vendor"). If omitted, files are written to root.'),
});
export type GitPullInput = z.infer<typeof GitPullInputSchema>;

export const GitMergeInputSchema = z.object({
  path: z.string().describe('File path (for context in error messages)'),
  base: z.string().optional().describe('Common ancestor content (for 3-way merge)'),
  ours: z.string().describe('Local/sandbox version'),
  theirs: z.string().describe('Incoming version'),
});
export type GitMergeInput = z.infer<typeof GitMergeInputSchema>;

export const GitBranchesInputSchema = z.object({
  target: GitTargetSchema.describe('Git target to list branches from'),
});
export type GitBranchesInput = z.infer<typeof GitBranchesInputSchema>;

// ============================================================================
// Tool Result Types
// ============================================================================

/**
 * Result returned by git tools.
 */
export interface GitToolResult {
  success: boolean;
  error?: string;
  hint?: string;
  [key: string]: unknown;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Git credential configuration.
 *
 * Controls how git credentials are obtained for push/pull operations.
 */
export interface GitCredentialsConfig {
  /**
   * Credential mode:
   * - 'inherit': Use host's git credentials (SSH agent, credential helpers, env vars).
   *              This is the default and works with existing user setup.
   * - 'explicit': Only use explicitly provided environment variables.
   */
  mode?: 'inherit' | 'explicit';

  /**
   * Additional environment variables to pass to git commands.
   * Merged with process.env (explicit vars take precedence).
   *
   * Common variables:
   * - GIT_AUTHOR_NAME, GIT_AUTHOR_EMAIL: Override committer identity
   * - GIT_SSH_COMMAND: Custom SSH configuration
   * - GIT_TERMINAL_PROMPT=0: Disable prompts in automation
   * - GITHUB_TOKEN: GitHub API authentication
   */
  env?: Record<string, string>;
}

export const GitCredentialsConfigSchema = z.object({
  mode: z.enum(['inherit', 'explicit']).optional().default('inherit'),
  env: z.record(z.string()).optional(),
});

/**
 * Git toolset configuration from worker YAML.
 */
export interface GitToolsetConfig {
  /** Default target for git operations */
  default_target?: GitTarget;
  /** Paths to auto-pull at worker start */
  auto_pull?: Array<{
    path: string;
    source: GitTarget;
  }>;
  /**
   * Credential configuration for git operations.
   * Defaults to 'inherit' mode which uses host credentials.
   */
  credentials?: GitCredentialsConfig;
}

export const GitToolsetConfigSchema = z.object({
  default_target: GitTargetSchema.optional(),
  auto_pull: z.array(z.object({
    path: z.string(),
    source: GitTargetSchema,
  })).optional(),
  credentials: GitCredentialsConfigSchema.optional(),
});

// ============================================================================
// Errors
// ============================================================================

/**
 * Error thrown for git-related failures.
 */
export class GitError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'GitError';
  }

  /**
   * Convert to LLM-friendly message.
   */
  toLLMMessage(): string {
    return this.message;
  }
}

/**
 * Error thrown when GitHub authentication fails.
 */
export class GitAuthError extends GitError {
  constructor(message: string) {
    super(message, 'AUTH_ERROR');
    this.name = 'GitAuthError';
  }
}
