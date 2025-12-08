/**
 * Tests for CLI git backend.
 */

import { describe, it, expect, beforeEach } from 'vitest';
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

  it('accepts project root option', () => {
    const backend = createCLIGitBackend({ projectRoot: '/test/project' });
    expect(backend).toBeInstanceOf(CLIGitBackend);
  });

  it('accepts env option for credential inheritance', () => {
    const backend = createCLIGitBackend({
      projectRoot: '/test/project',
      env: {
        GIT_AUTHOR_NAME: 'Test Author',
        GIT_AUTHOR_EMAIL: 'test@example.com',
      },
    });
    expect(backend).toBeInstanceOf(CLIGitBackend);
  });

  it('accepts empty env for explicit mode', () => {
    const backend = createCLIGitBackend({
      env: {},
    });
    expect(backend).toBeInstanceOf(CLIGitBackend);
  });
});
