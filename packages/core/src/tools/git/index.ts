/**
 * Git Toolset
 *
 * Platform-agnostic git tools for sandbox operations.
 * Works with any GitBackend implementation:
 * - CLI: Uses CLIGitBackend (spawns git processes)
 * - Browser: Uses IsomorphicGitBackend (pure JS)
 *
 * Note: isomorphic-git adds ~300KB to bundle. Consider lazy loading if needed.
 */

import type { FileOperations } from '../../sandbox-types.js';
import type { ApprovalConfig } from '../../approval/index.js';
import type { NamedTool, ToolsetContext } from '../base.js';
import { ToolsetRegistry } from '../registry.js';
import type { GitBackend } from './backend.js';
import type { GitToolsetConfig } from './types.js';
import {
  createGitStatusTool,
  createGitStageTool,
  createGitDiffTool,
  createGitPushTool,
  createGitDiscardTool,
  createGitPullTool,
  createGitMergeTool,
  createGitBranchesTool,
  createGitCheckConflictsTool,
  type GitToolContext,
} from './tools.js';

// Re-export types
export * from './types.js';
export * from './backend.js';
export * from './merge.js';
export {
  createGitStatusTool,
  createGitStageTool,
  createGitDiffTool,
  createGitPushTool,
  createGitDiscardTool,
  createGitPullTool,
  createGitMergeTool,
  createGitBranchesTool,
  createGitCheckConflictsTool,
  type GitToolContext,
  type GitToolOptions,
} from './tools.js';

// Isomorphic git backend (works in both Node.js and browser)
export {
  IsomorphicGitBackend,
  createNodeGitBackend,
  type IsomorphicGitBackendOptions,
  type IsomorphicFs,
} from './isomorphic-backend.js';

/**
 * Default approval configuration for git tools.
 * Read-only operations don't need approval, write operations do.
 */
const DEFAULT_GIT_APPROVAL_CONFIG: ApprovalConfig = {
  git_status: { preApproved: true },
  git_diff: { preApproved: true },
  git_branches: { preApproved: true },
  git_check_conflicts: { preApproved: true },
  git_stage: { preApproved: false },
  git_push: { preApproved: false },
  git_discard: { preApproved: false },
  git_pull: { preApproved: false },
  git_merge: { preApproved: true }, // Merge itself is safe, result needs review
};

/**
 * Helper to convert ApprovalConfig to needsApproval boolean.
 */
function configToNeedsApproval(config: ApprovalConfig, toolName: string): boolean | undefined {
  const toolConfig = config[toolName];
  if (!toolConfig) return undefined;
  return !toolConfig.preApproved;
}

/**
 * Options for creating a GitToolset.
 */
export interface GitToolsetOptions {
  /** Git backend for operations */
  backend: GitBackend;
  /** Sandbox for file operations */
  sandbox: FileOperations;
  /** Approval configuration for git tools */
  approvalConfig?: ApprovalConfig;
  /** Toolset configuration from worker YAML */
  config?: GitToolsetConfig;
}

/**
 * Toolset that provides all git tools.
 */
export class GitToolset {
  private tools: NamedTool[];

  constructor(options: GitToolsetOptions) {
    const approvalConfig: ApprovalConfig = {
      ...DEFAULT_GIT_APPROVAL_CONFIG,
      ...options.approvalConfig,
    };

    // Create context with default target from config
    const ctx: GitToolContext = {
      backend: options.backend,
      sandbox: options.sandbox,
      defaultTarget: options.config?.default_target,
    };

    // Create tools with needsApproval set based on config
    this.tools = [
      createGitStatusTool(ctx, { needsApproval: configToNeedsApproval(approvalConfig, 'git_status') }),
      createGitStageTool(ctx, { needsApproval: configToNeedsApproval(approvalConfig, 'git_stage') }),
      createGitDiffTool(ctx, { needsApproval: configToNeedsApproval(approvalConfig, 'git_diff') }),
      createGitPushTool(ctx, { needsApproval: configToNeedsApproval(approvalConfig, 'git_push') }),
      createGitDiscardTool(ctx, { needsApproval: configToNeedsApproval(approvalConfig, 'git_discard') }),
      createGitPullTool(ctx, { needsApproval: configToNeedsApproval(approvalConfig, 'git_pull') }),
      createGitMergeTool(ctx, { needsApproval: configToNeedsApproval(approvalConfig, 'git_merge') }),
      createGitBranchesTool(ctx, { needsApproval: configToNeedsApproval(approvalConfig, 'git_branches') }),
      createGitCheckConflictsTool(ctx, { needsApproval: configToNeedsApproval(approvalConfig, 'git_check_conflicts') }),
    ];
  }

  /**
   * Get all git tools.
   */
  getTools(): NamedTool[] {
    return this.tools;
  }
}

/**
 * Create all git tools.
 * Convenience function that returns individual tools.
 */
export function createGitTools(options: GitToolsetOptions): NamedTool[] {
  return new GitToolset(options).getTools();
}

/**
 * Extended context for git toolset factory.
 * Requires a gitBackend in addition to standard context.
 */
export interface GitToolsetContext extends ToolsetContext {
  /** Git backend for operations. Required for git toolset. */
  gitBackend?: GitBackend;
}

/**
 * Factory function for ToolsetRegistry.
 * Creates git tools from context.
 *
 * Note: This factory requires gitBackend in context.
 * If not provided, throws an error with instructions.
 */
export function gitToolsetFactory(ctx: ToolsetContext): NamedTool[] {
  if (!ctx.sandbox) {
    throw new Error('Git toolset requires a sandbox in context');
  }

  const gitCtx = ctx as GitToolsetContext;
  if (!gitCtx.gitBackend) {
    throw new Error(
      'Git toolset requires a gitBackend in context. ' +
      'In CLI, use CLIGitBackend. In browser, use IsomorphicGitBackend.'
    );
  }

  const config = ctx.config as GitToolsetConfig | undefined;

  // Map credentials config to approval config
  // If explicit credentials are provided, mark push/pull as pre-approved
  // (since they won't need user interaction for auth)
  let approvalConfig: ApprovalConfig | undefined;
  if (config?.credentials?.mode === 'explicit' && config.credentials.env) {
    approvalConfig = {
      git_push: { preApproved: true },
      git_pull: { preApproved: true },
    };
  }

  return new GitToolset({
    backend: gitCtx.gitBackend,
    sandbox: ctx.sandbox,
    approvalConfig,
    config,
  }).getTools();
}

// Self-register with ToolsetRegistry
ToolsetRegistry.register('git', gitToolsetFactory);
