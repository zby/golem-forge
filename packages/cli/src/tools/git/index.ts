/**
 * Git Toolset
 *
 * Provides git tools for sandbox-to-repository workflow.
 * Self-registers with ToolsetRegistry on module load.
 */

import { ToolsetRegistry, type ToolsetContext, type NamedTool } from '@golem-forge/core';
import { createCLIGitBackend } from './cli-backend.js';
import { createGitTools } from './tools.js';
import { GitToolsetConfigSchema, type GitToolsetConfig, type GitCredentialsConfig } from './types.js';

// ============================================================================
// GitToolset Class
// ============================================================================

/**
 * Options for creating a GitToolset.
 */
export interface GitToolsetOptions {
  /** Sandbox for file operations (supports both zone-based and mount-based) */
  sandbox?: import('../../sandbox/mount-types.js').FileOperations;
  /** Program root directory */
  programRoot?: string;
  /** Git toolset configuration */
  config?: GitToolsetConfig;
}

/**
 * Build environment variables from credentials config.
 *
 * In 'inherit' mode (default), we pass through any explicit env vars
 * but otherwise let git inherit from process.env naturally.
 *
 * In 'explicit' mode, we only use the provided env vars (future use case
 * for container isolation where we don't want credential leakage).
 */
function buildCredentialEnv(credentials?: GitCredentialsConfig): Record<string, string> | undefined {
  if (!credentials) {
    // Default: inherit mode with no overrides
    return undefined;
  }

  if (credentials.mode === 'explicit') {
    // Only use explicitly provided vars
    return credentials.env ?? {};
  }

  // Inherit mode: return env overrides if any (they'll be merged with process.env)
  return credentials.env;
}

/**
 * Toolset that provides git tools.
 */
export class GitToolset {
  private tools: NamedTool[];

  constructor(options: GitToolsetOptions) {
    const credentialEnv = buildCredentialEnv(options.config?.credentials);

    const backend = createCLIGitBackend({
      programRoot: options.programRoot,
      env: credentialEnv,
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
    programRoot: ctx.programRoot,
    config,
  });

  return toolset.getTools();
}

// Register on module load
// allowReplace: true because core may have already registered a git toolset
// CLI's version uses CLIGitBackend (native git with SSH support)
ToolsetRegistry.register('git', gitToolsetFactory, { allowReplace: true });

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
  GitCredentialsConfig,
  GitToolResult,
} from './types.js';

export {
  GitError,
  GitAuthError,
  GitTargetSchema,
  GitToolsetConfigSchema,
  GitCredentialsConfigSchema,
} from './types.js';

// Backend
export type { GitBackend, CreateStagedCommitInput, PushInput, PullInput } from './backend.js';
export type { CLIGitBackendOptions } from './cli-backend.js';
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
