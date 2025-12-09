/**
 * Git Tool Definitions
 *
 * LLM tools for git operations.
 * Follow the established NamedTool pattern from filesystem tools.
 */

import type { NamedTool, FileOperations, ToolExecutionOptions } from '@golem-forge/core';
import type { GitBackend } from './backend.js';
import type {
  GitStatusInput,
  GitStageInput,
  GitDiffInput,
  GitPushInput,
  GitDiscardInput,
  GitPullInput,
  GitMergeInput,
  GitBranchesInput,
  GitToolResult,
  GitTarget,
} from './types.js';
import {
  GitStatusInputSchema,
  GitStageInputSchema,
  GitDiffInputSchema,
  GitPushInputSchema,
  GitDiscardInputSchema,
  GitPullInputSchema,
  GitMergeInputSchema,
  GitBranchesInputSchema,
  GitError,
} from './types.js';
import { merge } from './merge.js';

/**
 * Options for creating git tools.
 */
export interface GitToolOptions {
  /** Git backend for operations */
  backend: GitBackend;
  /** Sandbox for file operations (supports both zone-based and mount-based) */
  sandbox?: FileOperations;
  /** Default git target (from worker config) */
  defaultTarget?: GitTarget;
}

/**
 * Handle errors and return LLM-friendly messages.
 */
function handleError(error: unknown): GitToolResult {
  if (error instanceof GitError) {
    return {
      success: false,
      error: error.toLLMMessage(),
      code: error.code,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    success: false,
    error: `Git operation failed: ${message}`,
  };
}

/**
 * Create a git_status tool.
 *
 * Shows status of sandbox and staged commits.
 * Read-only, no approval needed.
 */
export function createGitStatusTool(options: GitToolOptions): NamedTool {
  const { backend } = options;

  return {
    name: 'git_status',
    description: 'Show staged commits ready for push',
    inputSchema: GitStatusInputSchema,
    needsApproval: false, // Read-only
    manualExecution: {
      mode: 'both',
      label: 'Git Status',
      category: 'Git',
    },
    execute: async (_args: GitStatusInput, _options: ToolExecutionOptions) => {
      try {
        const staged = await backend.listStagedCommits();

        return {
          success: true,
          staged: staged.map(s => ({
            id: s.id,
            message: s.message,
            fileCount: s.files.length,
            files: s.files.map(f => f.sandboxPath),
            createdAt: s.createdAt.toISOString(),
          })),
          hint: staged.length > 0
            ? `Use git_diff to see changes, git_push to publish, or git_discard to remove.`
            : `Use git_stage to prepare files for commit.`,
        };
      } catch (error) {
        return handleError(error);
      }
    },
  };
}

/**
 * Create a git_stage tool.
 *
 * Stages files from sandbox for commit.
 * Requires approval (assisted mode - LLM suggests, user confirms).
 */
export function createGitStageTool(options: GitToolOptions): NamedTool {
  const { backend, sandbox } = options;

  return {
    name: 'git_stage',
    description: 'Stage sandbox files for commit. Creates a staged commit that can be reviewed and pushed.',
    inputSchema: GitStageInputSchema,
    needsApproval: true, // Assisted: LLM suggests files, user confirms
    manualExecution: {
      mode: 'both',
      label: 'Stage Files',
      category: 'Git',
    },
    execute: async (args: GitStageInput, _options: ToolExecutionOptions) => {
      try {
        if (!sandbox) {
          return {
            success: false,
            error: 'No sandbox available for staging files',
            hint: 'This worker does not have a sandbox configured.',
          };
        }

        // Read file contents from sandbox
        const files: Array<{ sandboxPath: string; content: Buffer }> = [];

        for (const filePath of args.files) {
          try {
            // Read as binary to preserve encoding
            const content = await sandbox.readBinary(filePath);
            files.push({
              sandboxPath: filePath,
              content: Buffer.from(content),
            });
          } catch (error) {
            return {
              success: false,
              error: `Failed to read file ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
              hint: 'Check that the file exists in the sandbox.',
            };
          }
        }

        if (files.length === 0) {
          return {
            success: false,
            error: 'No files to stage',
            hint: 'Provide at least one valid file path.',
          };
        }

        const staged = await backend.createStagedCommit({
          files,
          message: args.message,
        });

        return {
          success: true,
          commitId: staged.id,
          message: staged.message,
          fileCount: staged.files.length,
          files: staged.files.map(f => ({
            path: f.sandboxPath,
            operation: f.operation,
            size: f.size,
          })),
          hint: `Staged commit ${staged.id} created. Use git_diff to review changes, then git_push to publish.`,
        };
      } catch (error) {
        return handleError(error);
      }
    },
  };
}

/**
 * Create a git_diff tool.
 *
 * Shows diff for staged commits.
 * Read-only, no approval needed.
 * Available to both LLM and user.
 */
export function createGitDiffTool(options: GitToolOptions): NamedTool {
  const { backend } = options;

  return {
    name: 'git_diff',
    description: 'Show unified diff for a staged commit',
    inputSchema: GitDiffInputSchema,
    needsApproval: false, // Read-only
    manualExecution: {
      mode: 'both',
      label: 'Show Diff',
      category: 'Git',
    },
    execute: async (args: GitDiffInput, _options: ToolExecutionOptions) => {
      try {
        if (args.commitId) {
          const diff = await backend.diffStagedCommit(args.commitId);
          return {
            success: true,
            diff,
          };
        }

        // Show all staged commits
        const staged = await backend.listStagedCommits();
        if (staged.length === 0) {
          return {
            success: true,
            diff: 'No staged commits.',
            hint: 'Use git_stage to prepare files for commit.',
          };
        }

        const diffs: string[] = [];
        for (const commit of staged) {
          const diff = await backend.diffStagedCommit(commit.id);
          diffs.push(diff);
        }

        return {
          success: true,
          diff: diffs.join('\n---\n'),
        };
      } catch (error) {
        return handleError(error);
      }
    },
  };
}

/**
 * Create a git_push tool.
 *
 * Pushes staged commit to git target.
 * MANUAL ONLY - user must explicitly trigger push.
 * REQUIRES APPROVAL - persists changes outside sandbox.
 */
export function createGitPushTool(options: GitToolOptions): NamedTool {
  const { backend } = options;

  return {
    name: 'git_push',
    description: 'Push a staged commit to a git repository (local or GitHub)',
    inputSchema: GitPushInputSchema,
    needsApproval: true, // Persists changes outside sandbox
    manualExecution: {
      mode: 'manual',
      label: 'Push',
      category: 'Git',
    },
    execute: async (args: GitPushInput, _options: ToolExecutionOptions) => {
      try {
        const result = await backend.push({
          commitId: args.commitId,
          target: args.target,
        });

        if (result.status === 'conflict') {
          return {
            success: false,
            error: result.conflict?.message || 'Push conflict',
            reason: result.conflict?.reason,
            targetHead: result.conflict?.targetHead,
            hint: 'Pull latest changes, resolve conflicts, and try again.',
          };
        }

        return {
          success: true,
          commitSha: result.commitSha,
          target: args.target,
          hint: `Successfully pushed to ${args.target.type === 'github' ? args.target.repo : args.target.path}`,
        };
      } catch (error) {
        return handleError(error);
      }
    },
  };
}

/**
 * Create a git_discard tool.
 *
 * Discards a staged commit.
 * No approval needed (just cleans up prepared changes).
 */
export function createGitDiscardTool(options: GitToolOptions): NamedTool {
  const { backend } = options;

  return {
    name: 'git_discard',
    description: 'Discard a staged commit without pushing',
    inputSchema: GitDiscardInputSchema,
    needsApproval: false, // Just cleans up
    manualExecution: {
      mode: 'both',
      label: 'Discard Staged',
      category: 'Git',
    },
    execute: async (args: GitDiscardInput, _options: ToolExecutionOptions) => {
      try {
        await backend.discardStagedCommit(args.commitId);
        return {
          success: true,
          discarded: args.commitId,
        };
      } catch (error) {
        return handleError(error);
      }
    },
  };
}

/**
 * Create a git_pull tool.
 *
 * Pulls files from git into sandbox.
 * No approval needed (writes to sandbox only).
 */
export function createGitPullTool(options: GitToolOptions): NamedTool {
  const { backend, sandbox } = options;

  return {
    name: 'git_pull',
    description: 'Pull files from a git repository into the sandbox',
    inputSchema: GitPullInputSchema,
    needsApproval: false, // Writes to sandbox only
    manualExecution: {
      mode: 'both',
      label: 'Pull',
      category: 'Git',
    },
    execute: async (args: GitPullInput, _options: ToolExecutionOptions) => {
      try {
        if (!sandbox) {
          return {
            success: false,
            error: 'No sandbox available for pulling files',
          };
        }

        const files = await backend.pull({
          source: args.source,
          paths: args.paths,
        });

        // Optional destination prefix (e.g., "/vendor" to pull into /vendor/...)
        const destPrefix = args.destPath || '';
        const pulled: string[] = [];
        const conflicts: string[] = [];

        for (const file of files) {
          // Write to sandbox path directly (mount-based sandbox has no zones)
          const destPath = destPrefix ? `${destPrefix}/${file.path}` : `/${file.path}`;
          const newContent = file.content.toString('utf8');

          // Check if file exists in sandbox
          let existingContent: string | undefined;
          try {
            existingContent = await sandbox.read(destPath);
          } catch {
            // File doesn't exist
          }

          if (existingContent !== undefined && existingContent !== newContent) {
            // Conflict - merge with markers
            const merged = merge(existingContent, newContent);
            await sandbox.write(destPath, merged.content);
            pulled.push(destPath);
            if (merged.status === 'conflict') {
              conflicts.push(destPath);
            }
          } else {
            // No conflict - write directly
            await sandbox.write(destPath, newContent);
            pulled.push(destPath);
          }
        }

        return {
          success: true,
          pulled,
          conflicts,
          hint: conflicts.length > 0
            ? `${conflicts.length} file(s) have conflicts. Edit files to resolve markers, then stage and push.`
            : `Pulled ${pulled.length} file(s) successfully.`,
        };
      } catch (error) {
        return handleError(error);
      }
    },
  };
}

/**
 * Create a git_merge tool.
 *
 * Performs three-way merge (pure computation).
 * No approval needed.
 */
export function createGitMergeTool(_options: GitToolOptions): NamedTool {
  return {
    name: 'git_merge',
    description: 'Perform a three-way merge on text content',
    inputSchema: GitMergeInputSchema,
    needsApproval: false, // Pure computation
    manualExecution: {
      mode: 'both',
      label: 'Merge',
      category: 'Git',
    },
    execute: async (args: GitMergeInput, _options: ToolExecutionOptions) => {
      try {
        const result = merge(args.ours, args.theirs, args.base);

        return {
          success: true,
          status: result.status,
          content: result.content,
          hasConflicts: result.status === 'conflict',
          hint: result.status === 'conflict'
            ? 'Merge has conflicts. Edit the content to resolve conflict markers.'
            : 'Merge completed cleanly.',
        };
      } catch (error) {
        return handleError(error);
      }
    },
  };
}

/**
 * Create a git_branches tool.
 *
 * Lists branches in a repository.
 * Read-only, no approval needed.
 */
export function createGitBranchesTool(options: GitToolOptions): NamedTool {
  const { backend } = options;

  return {
    name: 'git_branches',
    description: 'List branches in a git repository',
    inputSchema: GitBranchesInputSchema,
    needsApproval: false, // Read-only
    manualExecution: {
      mode: 'both',
      label: 'List Branches',
      category: 'Git',
    },
    execute: async (args: GitBranchesInput, _options: ToolExecutionOptions) => {
      try {
        const result = await backend.listBranches(args.target);

        return {
          success: true,
          branches: result.branches,
          current: result.current,
          count: result.branches.length,
        };
      } catch (error) {
        return handleError(error);
      }
    },
  };
}

/**
 * Create all git tools.
 */
export function createGitTools(options: GitToolOptions): NamedTool[] {
  return [
    createGitStatusTool(options),
    createGitStageTool(options),
    createGitDiffTool(options),
    createGitPushTool(options),
    createGitDiscardTool(options),
    createGitPullTool(options),
    createGitMergeTool(options),
    createGitBranchesTool(options),
  ];
}
