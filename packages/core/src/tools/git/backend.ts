/**
 * Git Backend Interface
 *
 * Platform-agnostic abstraction layer for git operations.
 * Different backends can implement this:
 * - CLI: Uses native git commands (CLIGitBackend)
 * - Browser: Uses isomorphic-git (future)
 */

import type {
  StagedCommit,
  GitTarget,
  PushResult,
  BranchListResult,
  BinaryData,
} from './types.js';

/**
 * Diff summary for a single file.
 * Used for compact display in approval dialogs.
 */
export interface DiffSummary {
  /** File path */
  path: string;
  /** Number of lines added */
  additions: number;
  /** Number of lines deleted */
  deletions: number;
  /** Whether this is a new file */
  isNew?: boolean;
  /** Whether this file was deleted */
  isDeleted?: boolean;
}

/**
 * Input for creating a staged commit.
 */
export interface CreateStagedCommitInput {
  /** Files to stage with their content */
  files: Array<{
    sandboxPath: string;
    content: BinaryData;
  }>;
  /** Commit message */
  message: string;
}

/**
 * Input for push operation.
 */
export interface PushInput {
  /** ID of the staged commit to push */
  commitId: string;
  /** Target repository */
  target: GitTarget;
}

/**
 * Input for pull operation.
 */
export interface PullInput {
  /** Source repository */
  source: GitTarget;
  /** Paths to pull */
  paths: string[];
}

/**
 * Abstract interface for git backend operations.
 *
 * Implementations handle the actual git operations:
 * - CLI: Uses native git commands and isomorphic-git
 * - Browser: Uses isomorphic-git with OPFS storage
 */
export interface GitBackend {
  // ============================================================================
  // Staging Operations (Sandbox → Staging Area)
  // ============================================================================

  /**
   * Create a staged commit from sandbox files.
   *
   * @param input - Files and commit message
   * @returns The created staged commit
   */
  createStagedCommit(input: CreateStagedCommitInput): Promise<StagedCommit>;

  /**
   * Get a staged commit by ID.
   *
   * @param id - Commit ID
   * @returns The staged commit or null if not found
   */
  getStagedCommit(id: string): Promise<StagedCommit | null>;

  /**
   * List all staged commits.
   *
   * @returns Array of staged commits
   */
  listStagedCommits(): Promise<StagedCommit[]>;

  /**
   * Discard a staged commit.
   *
   * @param id - Commit ID to discard
   */
  discardStagedCommit(id: string): Promise<void>;

  // ============================================================================
  // Push Operations (Staging → Git)
  // ============================================================================

  /**
   * Push a staged commit to a git target.
   *
   * @param input - Commit ID and target
   * @returns Push result (success or conflict)
   */
  push(input: PushInput): Promise<PushResult>;

  // ============================================================================
  // Pull Operations (Git → Sandbox)
  // ============================================================================

  /**
   * Pull files from a git source.
   *
   * @param input - Source and paths to pull
   * @returns Array of path/content pairs
   */
  pull(input: PullInput): Promise<Array<{ path: string; content: BinaryData }>>;

  // ============================================================================
  // Diff/Status Operations
  // ============================================================================

  /**
   * Generate unified diff for a staged commit.
   *
   * @param id - Commit ID
   * @returns Unified diff string
   */
  diffStagedCommit(id: string): Promise<string>;

  /**
   * Get diff summary for a staged commit.
   *
   * Returns an array of file summaries with addition/deletion counts.
   * Used for compact display in approval dialogs.
   *
   * @param id - Commit ID
   * @returns Array of diff summaries
   */
  diffSummaryStagedCommit(id: string): Promise<DiffSummary[]>;

  // ============================================================================
  // Branch Operations
  // ============================================================================

  /**
   * List branches in a git target.
   *
   * @param target - Git target to query
   * @returns List of branches and current branch (if applicable)
   */
  listBranches(target: GitTarget): Promise<BranchListResult>;

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Clean up resources.
   */
  dispose(): Promise<void>;
}
