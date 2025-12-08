/**
 * Tests for git tools.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  createGitStatusTool,
  createGitStageTool,
  createGitDiffTool,
  createGitDiscardTool,
  createGitPullTool,
  createGitMergeTool,
  createGitTools,
} from './tools.js';
import type { GitBackend } from './backend.js';
import type { StagedCommit } from './types.js';
import type { FileOperations } from '../../sandbox/index.js';

// Mock sandbox
function createMockSandbox(files: Record<string, string> = {}): FileOperations {
  return {
    read: vi.fn(async (path: string) => {
      if (files[path]) return files[path];
      throw new Error('File not found');
    }),
    readBinary: vi.fn(async (path: string) => {
      if (files[path]) return new TextEncoder().encode(files[path]);
      throw new Error('File not found');
    }),
    write: vi.fn(),
    writeBinary: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(async (path: string) => path in files),
    list: vi.fn(async () => Object.keys(files).map(p => p.split('/').pop()!)),
    stat: vi.fn(),
    resolve: vi.fn((path: string) => path),
    isValidPath: vi.fn(() => true),
  } as FileOperations;
}

// Mock backend
function createMockBackend(staged: StagedCommit[] = []): GitBackend {
  return {
    createStagedCommit: vi.fn(async (input) => ({
      id: 'test-id',
      message: input.message,
      files: input.files.map(f => ({
        sandboxPath: f.sandboxPath,
        operation: 'create' as const,
        contentHash: 'hash',
        size: f.content.length,
      })),
      createdAt: new Date(),
    })),
    getStagedCommit: vi.fn(async (id) => staged.find(s => s.id === id) || null),
    listStagedCommits: vi.fn(async () => staged),
    discardStagedCommit: vi.fn(),
    push: vi.fn(async () => ({ status: 'success', commitSha: 'abc123' })),
    pull: vi.fn(async () => []),
    diffStagedCommit: vi.fn(async () => 'diff output'),
    listBranches: vi.fn(async () => ({ branches: ['main'], current: 'main' })),
    dispose: vi.fn(),
  };
}

describe('git tools', () => {
  describe('createGitStatusTool', () => {
    it('creates a tool with correct name', () => {
      const backend = createMockBackend();
      const tool = createGitStatusTool({ backend });
      expect(tool.name).toBe('git_status');
    });

    it('does not require approval', () => {
      const backend = createMockBackend();
      const tool = createGitStatusTool({ backend });
      expect(tool.needsApproval).toBe(false);
    });

    it('returns staged commits', async () => {
      const staged: StagedCommit[] = [{
        id: 'commit-1',
        message: 'Test commit',
        files: [{
          sandboxPath: '/src/test.txt',
          operation: 'create',
          contentHash: 'hash',
          size: 100,
        }],
        createdAt: new Date(),
      }];
      const backend = createMockBackend(staged);
      const tool = createGitStatusTool({ backend });

      const result = await tool.execute({}, { toolCallId: 'test' });

      expect(result.success).toBe(true);
      expect(result.staged).toHaveLength(1);
      expect(result.staged[0].id).toBe('commit-1');
      // Mount-based sandbox: no 'unstaged' field (zone concept removed)
      expect(result.unstaged).toBeUndefined();
    });
  });

  describe('createGitStageTool', () => {
    it('creates a tool with correct name', () => {
      const backend = createMockBackend();
      const tool = createGitStageTool({ backend });
      expect(tool.name).toBe('git_stage');
    });

    it('requires approval (assisted mode)', () => {
      const backend = createMockBackend();
      const tool = createGitStageTool({ backend });
      expect(tool.needsApproval).toBe(true);
    });

    it('requires sandbox', async () => {
      const backend = createMockBackend();
      const tool = createGitStageTool({ backend, sandbox: undefined });

      const result = await tool.execute(
        { files: ['/src/test.txt'], message: 'Test' },
        { toolCallId: 'test' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No sandbox');
    });

    it('stages files from sandbox', async () => {
      const backend = createMockBackend();
      const sandbox = createMockSandbox({
        '/src/test.txt': 'file content',
      });
      const tool = createGitStageTool({ backend, sandbox });

      const result = await tool.execute(
        { files: ['/src/test.txt'], message: 'Add test file' },
        { toolCallId: 'test' }
      );

      expect(result.success).toBe(true);
      expect(result.commitId).toBe('test-id');
      expect(backend.createStagedCommit).toHaveBeenCalled();
    });
  });

  describe('createGitDiffTool', () => {
    it('creates a tool with correct name', () => {
      const backend = createMockBackend();
      const tool = createGitDiffTool({ backend });
      expect(tool.name).toBe('git_diff');
    });

    it('does not require approval', () => {
      const backend = createMockBackend();
      const tool = createGitDiffTool({ backend });
      expect(tool.needsApproval).toBe(false);
    });

    it('returns diff for specific commit', async () => {
      const backend = createMockBackend();
      const tool = createGitDiffTool({ backend });

      const result = await tool.execute(
        { commitId: 'test-id' },
        { toolCallId: 'test' }
      );

      expect(result.success).toBe(true);
      expect(result.diff).toBe('diff output');
      expect(backend.diffStagedCommit).toHaveBeenCalledWith('test-id');
    });
  });

  describe('createGitDiscardTool', () => {
    it('creates a tool with correct name', () => {
      const backend = createMockBackend();
      const tool = createGitDiscardTool({ backend });
      expect(tool.name).toBe('git_discard');
    });

    it('does not require approval', () => {
      const backend = createMockBackend();
      const tool = createGitDiscardTool({ backend });
      expect(tool.needsApproval).toBe(false);
    });

    it('discards staged commit', async () => {
      const backend = createMockBackend();
      const tool = createGitDiscardTool({ backend });

      const result = await tool.execute(
        { commitId: 'test-id' },
        { toolCallId: 'test' }
      );

      expect(result.success).toBe(true);
      expect(result.discarded).toBe('test-id');
      expect(backend.discardStagedCommit).toHaveBeenCalledWith('test-id');
    });
  });

  describe('createGitPullTool', () => {
    it('creates a tool with correct name', () => {
      const backend = createMockBackend();
      const tool = createGitPullTool({ backend });
      expect(tool.name).toBe('git_pull');
    });

    it('does not require approval', () => {
      const backend = createMockBackend();
      const tool = createGitPullTool({ backend });
      expect(tool.needsApproval).toBe(false);
    });

    it('requires sandbox', async () => {
      const backend = createMockBackend();
      const tool = createGitPullTool({ backend, sandbox: undefined });

      const result = await tool.execute(
        { source: { type: 'local', path: '/repo' }, paths: ['file.txt'] },
        { toolCallId: 'test' }
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No sandbox');
    });

    it('pulls files to root by default', async () => {
      const backend = createMockBackend();
      (backend.pull as ReturnType<typeof vi.fn>).mockResolvedValue([
        { path: 'src/file.txt', content: Buffer.from('content') },
      ]);
      const sandbox = createMockSandbox({});
      const tool = createGitPullTool({ backend, sandbox });

      const result = await tool.execute(
        { source: { type: 'local', path: '/repo' }, paths: ['src/file.txt'] },
        { toolCallId: 'test' }
      );

      expect(result.success).toBe(true);
      expect(result.pulled).toEqual(['/src/file.txt']);
      expect(sandbox.write).toHaveBeenCalledWith('/src/file.txt', 'content');
    });

    it('pulls files to destPath when specified', async () => {
      const backend = createMockBackend();
      (backend.pull as ReturnType<typeof vi.fn>).mockResolvedValue([
        { path: 'file.txt', content: Buffer.from('content') },
      ]);
      const sandbox = createMockSandbox({});
      const tool = createGitPullTool({ backend, sandbox });

      const result = await tool.execute(
        { source: { type: 'local', path: '/repo' }, paths: ['file.txt'], destPath: '/vendor' },
        { toolCallId: 'test' }
      );

      expect(result.success).toBe(true);
      expect(result.pulled).toEqual(['/vendor/file.txt']);
      expect(sandbox.write).toHaveBeenCalledWith('/vendor/file.txt', 'content');
    });

    it('detects conflicts when file exists with different content', async () => {
      const backend = createMockBackend();
      (backend.pull as ReturnType<typeof vi.fn>).mockResolvedValue([
        { path: 'file.txt', content: Buffer.from('new content') },
      ]);
      const sandbox = createMockSandbox({
        '/file.txt': 'existing content',
      });
      const tool = createGitPullTool({ backend, sandbox });

      const result = await tool.execute(
        { source: { type: 'local', path: '/repo' }, paths: ['file.txt'] },
        { toolCallId: 'test' }
      );

      expect(result.success).toBe(true);
      expect(result.pulled).toEqual(['/file.txt']);
      expect(result.conflicts).toHaveLength(1);
    });
  });

  describe('createGitMergeTool', () => {
    it('creates a tool with correct name', () => {
      const backend = createMockBackend();
      const tool = createGitMergeTool({ backend });
      expect(tool.name).toBe('git_merge');
    });

    it('does not require approval', () => {
      const backend = createMockBackend();
      const tool = createGitMergeTool({ backend });
      expect(tool.needsApproval).toBe(false);
    });

    it('performs clean merge', async () => {
      const backend = createMockBackend();
      const tool = createGitMergeTool({ backend });

      const result = await tool.execute(
        {
          path: 'test.txt',
          base: 'base content',
          ours: 'our change',
          theirs: 'base content',
        },
        { toolCallId: 'test' }
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe('clean');
      expect(result.content).toBe('our change');
    });

    it('detects conflicts', async () => {
      const backend = createMockBackend();
      const tool = createGitMergeTool({ backend });

      const result = await tool.execute(
        {
          path: 'test.txt',
          base: 'original',
          ours: 'ours',
          theirs: 'theirs',
        },
        { toolCallId: 'test' }
      );

      expect(result.success).toBe(true);
      expect(result.status).toBe('conflict');
      expect(result.hasConflicts).toBe(true);
    });
  });

  describe('createGitTools', () => {
    it('creates all git tools', () => {
      const backend = createMockBackend();
      const tools = createGitTools({ backend });

      const toolNames = tools.map(t => t.name);
      expect(toolNames).toContain('git_status');
      expect(toolNames).toContain('git_stage');
      expect(toolNames).toContain('git_diff');
      expect(toolNames).toContain('git_push');
      expect(toolNames).toContain('git_discard');
      expect(toolNames).toContain('git_pull');
      expect(toolNames).toContain('git_merge');
      expect(toolNames).toContain('git_branches');
      expect(tools.length).toBe(8);
    });
  });
});
