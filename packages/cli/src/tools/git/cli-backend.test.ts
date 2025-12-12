/**
 * Tests for CLI git backend.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { CLIGitBackend, createCLIGitBackend } from './cli-backend.js';
import { GitError } from './types.js';

describe('CLIGitBackend', () => {
  let backend: CLIGitBackend;

  beforeEach(() => {
    backend = createCLIGitBackend();
  });

  describe('staged commits', () => {
    it('creates a staged commit', async () => {
      const staged = await backend.createStagedCommit({
        files: [{
          sandboxPath: '/workspace/test.txt',
          content: Buffer.from('test content'),
        }],
        message: 'Test commit',
      });

      expect(staged.id).toBeDefined();
      expect(staged.id.length).toBe(12); // 6 bytes = 12 hex chars
      expect(staged.message).toBe('Test commit');
      expect(staged.files).toHaveLength(1);
      expect(staged.files[0].sandboxPath).toBe('/workspace/test.txt');
      expect(staged.files[0].operation).toBe('create');
      expect(staged.files[0].size).toBe(12); // 'test content'.length
    });

    it('generates unique IDs', async () => {
      const staged1 = await backend.createStagedCommit({
        files: [{ sandboxPath: '/a.txt', content: Buffer.from('a') }],
        message: 'First',
      });
      const staged2 = await backend.createStagedCommit({
        files: [{ sandboxPath: '/b.txt', content: Buffer.from('b') }],
        message: 'Second',
      });

      expect(staged1.id).not.toBe(staged2.id);
    });

    it('retrieves a staged commit by ID', async () => {
      const created = await backend.createStagedCommit({
        files: [{ sandboxPath: '/test.txt', content: Buffer.from('content') }],
        message: 'Test',
      });

      const retrieved = await backend.getStagedCommit(created.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.message).toBe('Test');
    });

    it('returns null for non-existent commit', async () => {
      const result = await backend.getStagedCommit('nonexistent');
      expect(result).toBeNull();
    });

    it('lists all staged commits', async () => {
      await backend.createStagedCommit({
        files: [{ sandboxPath: '/a.txt', content: Buffer.from('a') }],
        message: 'First',
      });
      await backend.createStagedCommit({
        files: [{ sandboxPath: '/b.txt', content: Buffer.from('b') }],
        message: 'Second',
      });

      const list = await backend.listStagedCommits();

      expect(list).toHaveLength(2);
      expect(list.map(s => s.message)).toContain('First');
      expect(list.map(s => s.message)).toContain('Second');
    });

    it('discards a staged commit', async () => {
      const staged = await backend.createStagedCommit({
        files: [{ sandboxPath: '/test.txt', content: Buffer.from('content') }],
        message: 'To discard',
      });

      await backend.discardStagedCommit(staged.id);

      const retrieved = await backend.getStagedCommit(staged.id);
      expect(retrieved).toBeNull();
    });

    it('throws when discarding non-existent commit', async () => {
      await expect(
        backend.discardStagedCommit('nonexistent')
      ).rejects.toThrow(GitError);
    });
  });

  describe('diff generation', () => {
    it('generates diff for staged commit', async () => {
      const staged = await backend.createStagedCommit({
        files: [{
          sandboxPath: '/workspace/readme.md',
          content: Buffer.from('# Hello World\n\nThis is a test file.'),
        }],
        message: 'Add readme',
      });

      const diff = await backend.diffStagedCommit(staged.id);

      expect(diff).toContain('Staged commit:');
      expect(diff).toContain('Add readme');
      expect(diff).toContain('/workspace/readme.md');
      expect(diff).toContain('+# Hello World');
    });

    it('throws for non-existent commit', async () => {
      await expect(
        backend.diffStagedCommit('nonexistent')
      ).rejects.toThrow(GitError);
    });
  });

  describe('pushToLocal safety', () => {
    let repoDir: string;

    beforeEach(async () => {
      repoDir = await fs.mkdtemp(path.join(os.tmpdir(), 'golem-forge-git-backend-test-'));
      await fs.mkdir(path.join(repoDir, '.git'), { recursive: true });
    });

    afterEach(async () => {
      await fs.rm(repoDir, { recursive: true, force: true });
    });

    it('fails before writing when target branch mismatches', async () => {
      (backend as any).execGit = vi.fn((args: string[]) => {
        if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return 'main\n';
        throw new Error(`Unexpected git command: ${args.join(' ')}`);
      });

      const staged = await backend.createStagedCommit({
        files: [{
          sandboxPath: '/workspace/generated.txt',
          content: Buffer.from('content'),
        }],
        message: 'Worker commit',
      });

      await expect(backend.push({
        commitId: staged.id,
        target: {
          type: 'local',
          path: repoDir,
          branch: 'not-main',
        },
      })).rejects.toThrow(GitError);

      await expect(fs.access(path.join(repoDir, 'workspace', 'generated.txt'))).rejects.toThrow();
    });

    it('fails before writing when repo has staged changes', async () => {
      (backend as any).execGit = vi.fn((args: string[]) => {
        if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return 'main\n';
        if (args[0] === 'status' && args[1] === '--porcelain') return 'A  preexisting.txt\n';
        throw new Error(`Unexpected git command: ${args.join(' ')}`);
      });

      const staged = await backend.createStagedCommit({
        files: [{
          sandboxPath: '/workspace/generated.txt',
          content: Buffer.from('content'),
        }],
        message: 'Worker commit',
      });

      await expect(backend.push({
        commitId: staged.id,
        target: {
          type: 'local',
          path: repoDir,
          branch: 'main',
        },
      })).rejects.toThrow(/pre-existing staged/i);

      await expect(fs.access(path.join(repoDir, 'workspace', 'generated.txt'))).rejects.toThrow();
    });

    it('fails before writing when repo has unstaged changes', async () => {
      (backend as any).execGit = vi.fn((args: string[]) => {
        if (args[0] === 'rev-parse' && args[1] === '--abbrev-ref') return 'main\n';
        if (args[0] === 'status' && args[1] === '--porcelain') return ' M preexisting.txt\n';
        throw new Error(`Unexpected git command: ${args.join(' ')}`);
      });

      const staged = await backend.createStagedCommit({
        files: [{
          sandboxPath: '/workspace/generated.txt',
          content: Buffer.from('content'),
        }],
        message: 'Worker commit',
      });

      await expect(backend.push({
        commitId: staged.id,
        target: {
          type: 'local',
          path: repoDir,
          branch: 'main',
        },
      })).rejects.toThrow(/pre-existing unstaged/i);

      await expect(fs.access(path.join(repoDir, 'workspace', 'generated.txt'))).rejects.toThrow();
    });
  });

  describe('dispose', () => {
    it('clears staged commits', async () => {
      await backend.createStagedCommit({
        files: [{ sandboxPath: '/test.txt', content: Buffer.from('content') }],
        message: 'Test',
      });

      await backend.dispose();

      const list = await backend.listStagedCommits();
      expect(list).toHaveLength(0);
    });
  });
});

describe('createCLIGitBackend', () => {
  it('creates a backend instance', () => {
    const backend = createCLIGitBackend();
    expect(backend).toBeInstanceOf(CLIGitBackend);
  });

  it('accepts program root option', () => {
    const backend = createCLIGitBackend({ programRoot: '/test/program' });
    expect(backend).toBeInstanceOf(CLIGitBackend);
  });

  it('accepts credentials option for auth/env plumbing', () => {
    const backend = createCLIGitBackend({
      programRoot: '/test/program',
      credentials: { mode: 'inherit', env: { GITHUB_TOKEN: 'test-token' } },
    });
    expect(backend).toBeInstanceOf(CLIGitBackend);
  });

  it('accepts explicit mode credentials config', () => {
    const backend = createCLIGitBackend({
      credentials: { mode: 'explicit', env: {} },
    });
    expect(backend).toBeInstanceOf(CLIGitBackend);
  });
});
