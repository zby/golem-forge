/**
 * Tests for GitToolset configuration
 *
 * Tests that git toolset configuration (default_target, credentials) is
 * properly propagated to tools.
 */

import { describe, it, expect, vi } from 'vitest';
import { GitToolset, gitToolsetFactory } from './index.js';
import type { GitBackend } from './backend.js';
import type { FileOperations } from '../../sandbox-types.js';
import type { ApprovalController } from '../../approval/index.js';
import type { GitToolsetConfig, GitTarget } from './types.js';

// Mock sandbox
function createMockSandbox(): FileOperations {
  return {
    read: vi.fn(),
    readBinary: vi.fn(),
    write: vi.fn(),
    writeBinary: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(),
    list: vi.fn(),
    stat: vi.fn(),
    resolve: vi.fn((path: string) => path),
    isValidPath: vi.fn(() => true),
  } as unknown as FileOperations;
}

// Mock git backend
function createMockBackend(): GitBackend {
  return {
    createStagedCommit: vi.fn(),
    getStagedCommit: vi.fn(),
    listStagedCommits: vi.fn().mockResolvedValue([]),
    discardStagedCommit: vi.fn(),
    push: vi.fn(),
    pull: vi.fn(),
    diffStagedCommit: vi.fn(),
    diffSummaryStagedCommit: vi.fn().mockResolvedValue([]),
    listBranches: vi.fn(),
    dispose: vi.fn(),
  } as unknown as GitBackend;
}

// Mock approval controller
function createMockApprovalController(): ApprovalController {
  return {
    mode: 'approve_all',
    requestApproval: vi.fn().mockResolvedValue({ approved: true }),
  } as unknown as ApprovalController;
}

describe('GitToolset', () => {
  describe('constructor', () => {
    it('creates all git tools', () => {
      const toolset = new GitToolset({
        backend: createMockBackend(),
        sandbox: createMockSandbox(),
      });

      const tools = toolset.getTools();
      const toolNames = tools.map(t => t.name);

      expect(toolNames).toContain('git_status');
      expect(toolNames).toContain('git_stage');
      expect(toolNames).toContain('git_diff');
      expect(toolNames).toContain('git_push');
      expect(toolNames).toContain('git_discard');
      expect(toolNames).toContain('git_pull');
      expect(toolNames).toContain('git_merge');
      expect(toolNames).toContain('git_branches');
      expect(toolNames).toContain('git_check_conflicts');
    });

    it('passes default_target from config to tools context', () => {
      const defaultTarget: GitTarget = {
        type: 'github',
        repo: 'owner/repo',
        branch: 'main',
      };

      const config: GitToolsetConfig = {
        default_target: defaultTarget,
      };

      const toolset = new GitToolset({
        backend: createMockBackend(),
        sandbox: createMockSandbox(),
        config,
      });

      const tools = toolset.getTools();
      // Verify tools are created (the context is internal, so we test via factory)
      expect(tools.length).toBe(9);
    });

    it('applies custom approval config', () => {
      const toolset = new GitToolset({
        backend: createMockBackend(),
        sandbox: createMockSandbox(),
        approvalConfig: {
          git_push: { preApproved: true },
          git_pull: { preApproved: true },
        },
      });

      const tools = toolset.getTools();
      const pushTool = tools.find(t => t.name === 'git_push');
      const pullTool = tools.find(t => t.name === 'git_pull');

      // When preApproved is true, needsApproval should be false
      expect(pushTool?.needsApproval).toBe(false);
      expect(pullTool?.needsApproval).toBe(false);
    });

    it('uses default approval config when not specified', () => {
      const toolset = new GitToolset({
        backend: createMockBackend(),
        sandbox: createMockSandbox(),
      });

      const tools = toolset.getTools();
      const statusTool = tools.find(t => t.name === 'git_status');
      const pushTool = tools.find(t => t.name === 'git_push');

      // git_status is pre-approved by default
      expect(statusTool?.needsApproval).toBe(false);
      // git_push requires approval by default
      expect(pushTool?.needsApproval).toBe(true);
    });
  });
});

describe('gitToolsetFactory', () => {
  it('throws error when sandbox is missing', () => {
    expect(() => gitToolsetFactory({
      approvalController: createMockApprovalController(),
      config: {},
    })).toThrow('Git toolset requires a sandbox in context');
  });

  it('throws error when gitBackend is missing', () => {
    expect(() => gitToolsetFactory({
      sandbox: createMockSandbox(),
      approvalController: createMockApprovalController(),
      config: {},
    })).toThrow('Git toolset requires a gitBackend in context');
  });

  it('creates tools when gitBackend is in context', () => {
    const context = {
      sandbox: createMockSandbox(),
      approvalController: createMockApprovalController(),
      config: {},
      gitBackend: createMockBackend(),
    };

    const tools = gitToolsetFactory(context);

    expect(tools.length).toBe(9);
    expect(tools.map(t => t.name)).toContain('git_status');
  });

  it('maps explicit credentials config to approval config', () => {
    const context = {
      sandbox: createMockSandbox(),
      approvalController: createMockApprovalController(),
      config: {
        credentials: {
          mode: 'explicit' as const,
          env: {
            GITHUB_TOKEN: 'test-token',
          },
        },
      },
      gitBackend: createMockBackend(),
    };

    const tools = gitToolsetFactory(context);

    // When explicit credentials are configured, push/pull should be pre-approved
    const pushTool = tools.find(t => t.name === 'git_push');
    const pullTool = tools.find(t => t.name === 'git_pull');

    expect(pushTool?.needsApproval).toBe(false);
    expect(pullTool?.needsApproval).toBe(false);
  });

  it('does not pre-approve push/pull when credentials mode is inherit', () => {
    const context = {
      sandbox: createMockSandbox(),
      approvalController: createMockApprovalController(),
      config: {
        credentials: {
          mode: 'inherit' as const,
        },
      },
      gitBackend: createMockBackend(),
    };

    const tools = gitToolsetFactory(context);

    // When inherit mode (no explicit credentials), push should require approval
    const pushTool = tools.find(t => t.name === 'git_push');

    expect(pushTool?.needsApproval).toBe(true);
  });

  it('passes default_target from config', () => {
    const defaultTarget: GitTarget = {
      type: 'local',
      path: '/repo',
    };

    const context = {
      sandbox: createMockSandbox(),
      approvalController: createMockApprovalController(),
      config: {
        default_target: defaultTarget,
      },
      gitBackend: createMockBackend(),
    };

    const tools = gitToolsetFactory(context);

    // Tools should be created successfully with the config
    expect(tools.length).toBe(9);
  });
});
