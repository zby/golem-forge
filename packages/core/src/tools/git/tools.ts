/**
 * Git Tool Implementations
 *
 * Platform-agnostic git tools that work with any GitBackend implementation.
 * Works in both Node.js (CLI with CLIGitBackend) and browser (with IsomorphicGitBackend).
 */

import { z } from 'zod';
import type { FileOperations } from '../../sandbox-types.js';
import type { NamedTool } from '../base.js';
import type { GitBackend, DiffSummary } from './backend.js';
import {
  GitStatusInputSchema,
  GitStageInputSchema,
  GitDiffInputSchema,
  GitPushInputSchema,
  GitDiscardInputSchema,
  GitPullInputSchema,
  GitMergeInputSchema,
  GitBranchesInputSchema,
  type GitToolResult,
  type GitStatus,
  type StagedCommit,
  type PullResult,
  type MergeResult,
  type BranchListResult,
  type PushResult,
  type GitTarget,
} from './types.js';
import { merge as mergeContent, hasConflictMarkers } from './merge.js';

/**
 * Options for creating git tools.
 */
export interface GitToolOptions {
  /** Whether the tool needs approval before execution */
  needsApproval?: boolean;
}

/**
 * Context required for git tools.
 */
export interface GitToolContext {
  /** Git backend for operations */
  backend: GitBackend;
  /** Sandbox for file operations */
  sandbox: FileOperations;
  /** Default target for push/pull when not specified in input (from config) */
  defaultTarget?: GitTarget;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a staged commit for display.
 */
function formatStagedCommit(commit: StagedCommit): string {
  const lines = [
    `Commit: ${commit.id}`,
    `Message: ${commit.message}`,
    `Files (${commit.files.length}):`,
  ];
  for (const file of commit.files) {
    const op = file.operation === 'create' ? '+' : file.operation === 'delete' ? '-' : '~';
    lines.push(`  ${op} ${file.sandboxPath} (${file.size} bytes)`);
  }
  return lines.join('\n');
}

/**
 * Format diff summary for compact display.
 */
function formatDiffSummary(summaries: DiffSummary[]): string {
  const lines: string[] = [];
  for (const s of summaries) {
    const prefix = s.isNew ? '[new] ' : s.isDeleted ? '[del] ' : '';
    lines.push(`${prefix}${s.path}: +${s.additions} -${s.deletions}`);
  }
  return lines.join('\n');
}

// ============================================================================
// Tool Creation Functions
// ============================================================================

/**
 * Create git_status tool.
 * Shows staged commits and unstaged files.
 */
export function createGitStatusTool(
  ctx: GitToolContext,
  options: GitToolOptions = {}
): NamedTool {
  return {
    name: 'git_status',
    description: 'Show git status: staged commits and unstaged sandbox files.',
    inputSchema: GitStatusInputSchema,
    needsApproval: options.needsApproval ?? false,
    execute: async (): Promise<GitToolResult> => {
      try {
        const staged = await ctx.backend.listStagedCommits();

        // TODO: Get unstaged files from sandbox
        // For now, return just staged commits
        const status: GitStatus = {
          staged,
          unstaged: [],
        };

        const lines: string[] = [];

        if (status.staged.length === 0) {
          lines.push('No staged commits.');
        } else {
          lines.push(`Staged commits (${status.staged.length}):`);
          for (const commit of status.staged) {
            lines.push('');
            lines.push(formatStagedCommit(commit));
          }
        }

        if (status.unstaged.length > 0) {
          lines.push('');
          lines.push(`Unstaged files (${status.unstaged.length}):`);
          for (const file of status.unstaged) {
            const prefix = file.status === 'new' ? '+' : file.status === 'deleted' ? '-' : '~';
            lines.push(`  ${prefix} ${file.path}`);
          }
        }

        return {
          success: true,
          stagedCount: status.staged.length,
          unstagedCount: status.unstaged.length,
          message: lines.join('\n'),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/**
 * Create git_stage tool.
 * Stage sandbox files for commit.
 */
export function createGitStageTool(
  ctx: GitToolContext,
  options: GitToolOptions = {}
): NamedTool {
  return {
    name: 'git_stage',
    description: 'Stage sandbox files for commit. Creates a staged commit that can be pushed later.',
    inputSchema: GitStageInputSchema,
    needsApproval: options.needsApproval ?? false,
    execute: async (input: z.infer<typeof GitStageInputSchema>): Promise<GitToolResult> => {
      try {
        // Read file contents from sandbox (as binary for git)
        const files: Array<{ sandboxPath: string; content: Uint8Array }> = [];

        for (const path of input.files) {
          const content = await ctx.sandbox.readBinary(path);
          files.push({ sandboxPath: path, content });
        }

        const commit = await ctx.backend.createStagedCommit({
          files,
          message: input.message,
        });

        return {
          success: true,
          commitId: commit.id,
          message: `Staged ${commit.files.length} file(s) with message: "${commit.message}"`,
          hint: `Use git_diff to review changes, git_push to push, or git_discard to discard.`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/**
 * Create git_diff tool.
 * Show diff for staged commit(s).
 */
export function createGitDiffTool(
  ctx: GitToolContext,
  options: GitToolOptions = {}
): NamedTool {
  return {
    name: 'git_diff',
    description: 'Show diff for a staged commit. Displays unified diff format.',
    inputSchema: GitDiffInputSchema,
    needsApproval: options.needsApproval ?? false,
    execute: async (input: z.infer<typeof GitDiffInputSchema>): Promise<GitToolResult> => {
      try {
        if (input.commitId) {
          // Show diff for specific commit
          const diff = await ctx.backend.diffStagedCommit(input.commitId);
          const summary = await ctx.backend.diffSummaryStagedCommit(input.commitId);

          return {
            success: true,
            commitId: input.commitId,
            summary: formatDiffSummary(summary),
            diff,
          };
        } else {
          // Show diffs for all staged commits
          const commits = await ctx.backend.listStagedCommits();

          if (commits.length === 0) {
            return {
              success: true,
              message: 'No staged commits to diff.',
            };
          }

          const results: Array<{ id: string; summary: string; diff: string }> = [];
          for (const commit of commits) {
            const diff = await ctx.backend.diffStagedCommit(commit.id);
            const summary = await ctx.backend.diffSummaryStagedCommit(commit.id);
            results.push({
              id: commit.id,
              summary: formatDiffSummary(summary),
              diff,
            });
          }

          return {
            success: true,
            commits: results,
          };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/**
 * Create git_push tool.
 * Push a staged commit to git.
 */
export function createGitPushTool(
  ctx: GitToolContext,
  options: GitToolOptions = {}
): NamedTool {
  return {
    name: 'git_push',
    description: 'Push a staged commit to a git target (GitHub, local repo, or bare repo).',
    inputSchema: GitPushInputSchema,
    needsApproval: options.needsApproval ?? true, // Default needs approval
    execute: async (input: z.infer<typeof GitPushInputSchema>): Promise<GitToolResult> => {
      try {
        const result: PushResult = await ctx.backend.push({
          commitId: input.commitId,
          target: input.target,
        });

        if (result.status === 'success') {
          return {
            success: true,
            commitSha: result.commitSha,
            message: `Successfully pushed commit ${input.commitId}`,
          };
        } else {
          return {
            success: false,
            error: result.conflict?.message || 'Push failed',
            conflict: result.conflict,
            hint: result.conflict?.reason === 'non-fast-forward'
              ? 'Use git_pull to update your sandbox, then retry push.'
              : undefined,
          };
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/**
 * Create git_discard tool.
 * Discard a staged commit.
 */
export function createGitDiscardTool(
  ctx: GitToolContext,
  options: GitToolOptions = {}
): NamedTool {
  return {
    name: 'git_discard',
    description: 'Discard a staged commit without pushing.',
    inputSchema: GitDiscardInputSchema,
    needsApproval: options.needsApproval ?? false,
    execute: async (input: z.infer<typeof GitDiscardInputSchema>): Promise<GitToolResult> => {
      try {
        await ctx.backend.discardStagedCommit(input.commitId);

        return {
          success: true,
          message: `Discarded staged commit ${input.commitId}`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/**
 * Create git_pull tool.
 * Pull files from git to sandbox.
 */
export function createGitPullTool(
  ctx: GitToolContext,
  options: GitToolOptions = {}
): NamedTool {
  return {
    name: 'git_pull',
    description: 'Pull files from a git source into the sandbox. Performs 3-way merge if files exist.',
    inputSchema: GitPullInputSchema,
    needsApproval: options.needsApproval ?? false,
    execute: async (input: z.infer<typeof GitPullInputSchema>): Promise<GitToolResult> => {
      try {
        const pulledFiles = await ctx.backend.pull({
          source: input.source,
          paths: input.paths,
        });

        const result: PullResult = {
          pulled: [],
          conflicts: [],
        };

        const decoder = new TextDecoder();

        for (const { path, content } of pulledFiles) {
          // Determine destination path
          const destPath = input.destPath
            ? `${input.destPath}/${path}`.replace(/\/+/g, '/')
            : `/${path}`.replace(/\/+/g, '/');

          // Check if file exists in sandbox
          const exists = await ctx.sandbox.exists(destPath);

          if (exists) {
            // 3-way merge (text files only)
            const currentContent = await ctx.sandbox.read(destPath);
            const incomingContent = decoder.decode(content);

            // For now, use 2-way merge (no base available)
            const mergeResult: MergeResult = mergeContent(currentContent, incomingContent);

            // Write merged content as text
            await ctx.sandbox.write(destPath, mergeResult.content);

            result.pulled.push(destPath);
            if (mergeResult.status === 'conflict') {
              result.conflicts.push(destPath);
            }
          } else {
            // New file - write as binary (preserves encoding)
            await ctx.sandbox.writeBinary(destPath, content);
            result.pulled.push(destPath);
          }
        }

        const message = result.conflicts.length > 0
          ? `Pulled ${result.pulled.length} file(s) with ${result.conflicts.length} conflict(s)`
          : `Pulled ${result.pulled.length} file(s) cleanly`;

        return {
          success: true,
          pulled: result.pulled,
          conflicts: result.conflicts,
          message,
          hint: result.conflicts.length > 0
            ? 'Resolve conflicts marked with <<<<<<< ======= >>>>>>> markers, then git_stage again.'
            : undefined,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/**
 * Create git_merge tool.
 * Perform a merge operation (utility tool).
 */
export function createGitMergeTool(
  _ctx: GitToolContext,
  options: GitToolOptions = {}
): NamedTool {
  return {
    name: 'git_merge',
    description: 'Merge two versions of content, optionally with a base for 3-way merge.',
    inputSchema: GitMergeInputSchema,
    needsApproval: options.needsApproval ?? false,
    execute: async (input: z.infer<typeof GitMergeInputSchema>): Promise<GitToolResult> => {
      try {
        const result: MergeResult = mergeContent(input.ours, input.theirs, input.base);

        return {
          success: true,
          status: result.status,
          content: result.content,
          hasConflicts: result.status === 'conflict',
          hint: result.status === 'conflict'
            ? `File ${input.path} has conflicts. Resolve markers and save.`
            : undefined,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/**
 * Create git_branches tool.
 * List branches in a git target.
 */
export function createGitBranchesTool(
  ctx: GitToolContext,
  options: GitToolOptions = {}
): NamedTool {
  return {
    name: 'git_branches',
    description: 'List branches in a git target.',
    inputSchema: GitBranchesInputSchema,
    needsApproval: options.needsApproval ?? false,
    execute: async (input: z.infer<typeof GitBranchesInputSchema>): Promise<GitToolResult> => {
      try {
        const result: BranchListResult = await ctx.backend.listBranches(input.target);

        const lines: string[] = [];
        for (const branch of result.branches) {
          const isCurrent = branch === result.current;
          lines.push(`${isCurrent ? '* ' : '  '}${branch}`);
        }

        return {
          success: true,
          branches: result.branches,
          current: result.current,
          message: lines.join('\n'),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

/**
 * Create git_check_conflicts tool.
 * Check if content has conflict markers.
 */
export function createGitCheckConflictsTool(
  ctx: GitToolContext,
  options: GitToolOptions = {}
): NamedTool {
  return {
    name: 'git_check_conflicts',
    description: 'Check if a sandbox file has unresolved conflict markers.',
    inputSchema: z.object({
      path: z.string().describe('Sandbox path to check'),
    }),
    needsApproval: options.needsApproval ?? false,
    execute: async (input: { path: string }): Promise<GitToolResult> => {
      try {
        // Read as text since we're looking for conflict markers
        const text = await ctx.sandbox.read(input.path);
        const hasConflicts = hasConflictMarkers(text);

        return {
          success: true,
          path: input.path,
          hasConflicts,
          message: hasConflicts
            ? `File ${input.path} has unresolved conflict markers.`
            : `File ${input.path} is clean (no conflict markers).`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}
