/**
 * Git Toolset
 *
 * Provides git tools for sandbox-to-repository workflow.
 * Self-registers with ToolsetRegistry on module load.
 */

import { ToolsetRegistry, type ToolsetContext } from '../registry.js';
import type { NamedTool } from '../filesystem.js';
import { createCLIGitBackend } from './cli-backend.js';
import { createGitTools } from './tools.js';
import { GitToolsetConfigSchema, type GitToolsetConfig } from './types.js';

// ============================================================================
// GitToolset Class
// ============================================================================

/**
 * Options for creating a GitToolset.
 */
export interface GitToolsetOptions {
  /** Sandbox for file operations */
  sandbox?: import('../../sandbox/interface.js').Sandbox;
  /** Project root directory */
  projectRoot?: string;
  /** Git toolset configuration */
  config?: GitToolsetConfig;
}

/**
 * Toolset that provides git tools.
 */
export class GitToolset {
  private tools: NamedTool[];

  constructor(options: GitToolsetOptions) {
    const backend = createCLIGitBackend({
      projectRoot: options.projectRoot,
    });

    this.tools = createGitTools({
      backend,
      sandbox: options.sandbox,
      defaultTarget: options.config?.default_target,
    });
  }

  /**
   * Get all git tools.
   */
  getTools(): NamedTool[] {
    return this.tools;
  }
}

// ============================================================================
// Self-Registration
// ============================================================================

/**
 * Factory function for git toolset.
 * Validates config and creates tools.
 */
async function gitToolsetFactory(ctx: ToolsetContext): Promise<NamedTool[]> {
  // Validate config if provided
  let config: GitToolsetConfig | undefined;
  if (ctx.config && Object.keys(ctx.config).length > 0) {
    const parseResult = GitToolsetConfigSchema.safeParse(ctx.config);
    if (!parseResult.success) {
      throw new Error(`Invalid git toolset config: ${parseResult.error.message}`);
    }
    config = parseResult.data;
  }

  const toolset = new GitToolset({
    sandbox: ctx.sandbox,
    projectRoot: ctx.projectRoot,
    config,
  });

  return toolset.getTools();
}

// Register on module load
ToolsetRegistry.register('git', gitToolsetFactory);

// ============================================================================
// Exports
// ============================================================================

// Toolset class
export { GitToolset as default };

// Types
export type {
  GitTarget,
  GitHubTarget,
  LocalTarget,
  LocalBareTarget,
  StagedCommit,
  StagedFile,
  GitStatus,
  UnstagedFile,
  PullResult,
  MergeResult,
  PushResult,
  PushConflict,
  BranchListResult,
  GitToolsetConfig,
  GitToolResult,
} from './types.js';

export {
  GitError,
  GitAuthError,
  GitTargetSchema,
  GitToolsetConfigSchema,
} from './types.js';

// Backend
export type { GitBackend, CreateStagedCommitInput, PushInput, PullInput } from './backend.js';
export { CLIGitBackend, createCLIGitBackend } from './cli-backend.js';

// Auth
export { getGitHubAuth, hasGitHubAuth, clearAuthCache } from './auth.js';

// Merge
export { merge, threeWayMerge, generateDiff, hasConflictMarkers } from './merge.js';

// Tools
export {
  createGitStatusTool,
  createGitStageTool,
  createGitDiffTool,
  createGitPushTool,
  createGitDiscardTool,
  createGitPullTool,
  createGitMergeTool,
  createGitBranchesTool,
  createGitTools,
} from './tools.js';
