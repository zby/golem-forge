import { describe, it, expect, beforeEach } from 'vitest';
import {
  Zone,
  Sandbox,
  SandboxImpl,
  MemoryBackend,
  NotFoundError,
  InvalidPathError,
  getZoneFromPath,
  isValidZonePath,
  createTestSandbox,
} from './index.js';

describe('Sandbox', () => {
  describe('Zone Detection', () => {
    it('detects cache zone', () => {
      expect(getZoneFromPath('/cache/file.pdf')).toBe(Zone.CACHE);
    });

    it('detects workspace zone', () => {
      expect(getZoneFromPath('/workspace/report.md')).toBe(Zone.WORKSPACE);
    });

    it('throws on unknown zone', () => {
      expect(() => getZoneFromPath('/unknown/file.txt')).toThrow();
    });

    it('validates zone paths correctly', () => {
      expect(isValidZonePath('/cache/file.txt')).toBe(true);
      expect(isValidZonePath('/workspace/file.txt')).toBe(true);
      expect(isValidZonePath('/unknown/file.txt')).toBe(false);
    });
  });

  describe('File Operations', () => {
    let sandbox: Sandbox;

    beforeEach(async () => {
      sandbox = await createTestSandbox();
    });

    it('writes and reads text content', async () => {
      await sandbox.write('/workspace/report.md', '# My Report');
      const content = await sandbox.read('/workspace/report.md');
      expect(content).toBe('# My Report');
    });

    it('writes and reads in cache zone', async () => {
      await sandbox.write('/cache/data.json', '{"key": "value"}');
      const content = await sandbox.read('/cache/data.json');
      expect(content).toBe('{"key": "value"}');
    });

    it('throws NotFoundError for non-existent file', async () => {
      await expect(sandbox.read('/workspace/nonexistent.txt')).rejects.toThrow(NotFoundError);
    });

    it('overwrites existing files', async () => {
      await sandbox.write('/workspace/file.txt', 'original');
      await sandbox.write('/workspace/file.txt', 'updated');
      const content = await sandbox.read('/workspace/file.txt');
      expect(content).toBe('updated');
    });

    it('deletes files', async () => {
      await sandbox.write('/workspace/temp.txt', 'temp');
      expect(await sandbox.exists('/workspace/temp.txt')).toBe(true);
      await sandbox.delete('/workspace/temp.txt');
      expect(await sandbox.exists('/workspace/temp.txt')).toBe(false);
    });

    it('throws NotFoundError when deleting non-existent file', async () => {
      await expect(sandbox.delete('/workspace/nonexistent.txt')).rejects.toThrow(NotFoundError);
    });

    it('checks file existence', async () => {
      expect(await sandbox.exists('/workspace/file.txt')).toBe(false);
      await sandbox.write('/workspace/file.txt', 'content');
      expect(await sandbox.exists('/workspace/file.txt')).toBe(true);
    });

    it('lists directory contents', async () => {
      await sandbox.write('/workspace/a.txt', 'a');
      await sandbox.write('/workspace/b.txt', 'b');
      await sandbox.write('/workspace/c.txt', 'c');
      const files = await sandbox.list('/workspace');
      expect(files).toContain('a.txt');
      expect(files).toContain('b.txt');
      expect(files).toContain('c.txt');
    });

    it('throws NotFoundError when listing non-existent directory', async () => {
      await expect(sandbox.list('/workspace/nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('Binary Operations', () => {
    let sandbox: Sandbox;

    beforeEach(async () => {
      sandbox = await createTestSandbox();
    });

    it('writes and reads binary content', async () => {
      const content = new Uint8Array([0x89, 0x50, 0x4E, 0x47]); // PNG header
      await sandbox.writeBinary('/cache/image.png', content);
      const read = await sandbox.readBinary('/cache/image.png');
      expect(read).toEqual(content);
    });

    it('handles empty binary content', async () => {
      const content = new Uint8Array([]);
      await sandbox.writeBinary('/cache/empty.bin', content);
      const read = await sandbox.readBinary('/cache/empty.bin');
      expect(read.length).toBe(0);
    });
  });

  describe('File Metadata', () => {
    let sandbox: Sandbox;

    beforeEach(async () => {
      sandbox = await createTestSandbox();
    });

    it('returns file stats', async () => {
      await sandbox.write('/workspace/file.txt', 'hello world');
      const stat = await sandbox.stat('/workspace/file.txt');

      expect(stat.path).toBe('/workspace/file.txt');
      expect(stat.size).toBe(11);
      expect(stat.isDirectory).toBe(false);
      expect(stat.createdAt).toBeInstanceOf(Date);
      expect(stat.modifiedAt).toBeInstanceOf(Date);
    });

    it('throws NotFoundError for non-existent file stat', async () => {
      await expect(sandbox.stat('/workspace/nonexistent.txt')).rejects.toThrow(NotFoundError);
    });
  });

  describe('Path Operations', () => {
    let sandbox: Sandbox;

    beforeEach(async () => {
      sandbox = await createTestSandbox();
    });

    it('resolves paths to real filesystem paths', async () => {
      const realPath = sandbox.resolve('/workspace/report.md');
      expect(realPath).toContain('workspace');
      expect(realPath).toContain('report.md');
    });

    it('gets zone for path', () => {
      expect(sandbox.getZone('/cache/file.pdf')).toBe(Zone.CACHE);
      expect(sandbox.getZone('/workspace/report.md')).toBe(Zone.WORKSPACE);
    });

    it('validates paths correctly', () => {
      expect(sandbox.isValidPath('/workspace/file.txt')).toBe(true);
      expect(sandbox.isValidPath('/cache/file.txt')).toBe(true);
      expect(sandbox.isValidPath('/unknown/file.txt')).toBe(false);
    });

    it('throws InvalidPathError for relative paths', async () => {
      await expect(sandbox.read('relative/path.txt')).rejects.toThrow(InvalidPathError);
    });

    it('throws InvalidPathError for unknown zones', async () => {
      await expect(sandbox.read('/unknown/file.txt')).rejects.toThrow(InvalidPathError);
    });
  });

  describe('Path Normalization', () => {
    let sandbox: Sandbox;

    beforeEach(async () => {
      sandbox = await createTestSandbox();
    });

    it('normalizes paths with . segments', async () => {
      await sandbox.write('/workspace/./file.txt', 'content');
      const content = await sandbox.read('/workspace/file.txt');
      expect(content).toBe('content');
    });

    it('normalizes paths with .. segments', async () => {
      await sandbox.write('/workspace/subdir/../file.txt', 'content');
      const content = await sandbox.read('/workspace/file.txt');
      expect(content).toBe('content');
    });

    it('handles multiple .. segments', async () => {
      await sandbox.write('/workspace/a/b/c/file.txt', 'deep');
      const content = await sandbox.read('/workspace/a/b/c/../../b/c/file.txt');
      expect(content).toBe('deep');
    });
  });

  describe('Path Security', () => {
    let sandbox: Sandbox;

    beforeEach(async () => {
      sandbox = await createTestSandbox();
    });

    it('prevents path traversal escaping sandbox', async () => {
      await expect(
        sandbox.read('/workspace/../../../etc/passwd')
      ).rejects.toThrow(InvalidPathError);
    });

    it('handles excessive .. attempts', async () => {
      await expect(
        sandbox.read('/cache/../../../../../../../../etc/passwd')
      ).rejects.toThrow(InvalidPathError);
    });

    it('rejects empty zone after normalization', async () => {
      await expect(sandbox.read('/../..')).rejects.toThrow(InvalidPathError);
    });
  });

  describe('Nested Directories', () => {
    let sandbox: Sandbox;

    beforeEach(async () => {
      sandbox = await createTestSandbox();
    });

    it('creates deeply nested directories on write', async () => {
      await sandbox.write('/workspace/a/b/c/d/deep.txt', 'deep content');
      const content = await sandbox.read('/workspace/a/b/c/d/deep.txt');
      expect(content).toBe('deep content');
    });

    it('lists nested directories', async () => {
      await sandbox.write('/workspace/dir/file1.txt', 'a');
      await sandbox.write('/workspace/dir/file2.txt', 'b');
      const files = await sandbox.list('/workspace/dir');
      expect(files).toContain('file1.txt');
      expect(files).toContain('file2.txt');
    });
  });

  describe('Memory Backend', () => {
    let backend: MemoryBackend;
    let sandbox: Sandbox;

    beforeEach(async () => {
      backend = new MemoryBackend();
      await backend.initialize({ mode: 'sandboxed' });
      sandbox = new SandboxImpl(backend);
    });

    it('seeds files for testing', async () => {
      backend.seedFile('/workspace/test.txt', 'seeded content');
      const content = await sandbox.read('/workspace/test.txt');
      expect(content).toBe('seeded content');
    });

    it('resets state', async () => {
      await sandbox.write('/workspace/file.txt', 'content');
      backend.reset();
      expect(await sandbox.exists('/workspace/file.txt')).toBe(false);
    });

    it('exposes files for inspection', async () => {
      await sandbox.write('/workspace/file.txt', 'content');
      const files = backend.getFiles();
      expect(files.has('/workspace/file.txt')).toBe(true);
    });
  });

  describe('Cross-Zone Operations', () => {
    let sandbox: Sandbox;

    beforeEach(async () => {
      sandbox = await createTestSandbox();
    });

    it('operates independently across zones', async () => {
      await sandbox.write('/workspace/file.txt', 'workspace');
      await sandbox.write('/cache/file.txt', 'cache');

      expect(await sandbox.read('/workspace/file.txt')).toBe('workspace');
      expect(await sandbox.read('/cache/file.txt')).toBe('cache');
    });

    it('same filename in different zones are separate', async () => {
      await sandbox.write('/workspace/data.json', '{"zone": "workspace"}');
      await sandbox.write('/cache/data.json', '{"zone": "cache"}');

      const workspaceData = JSON.parse(await sandbox.read('/workspace/data.json'));
      const cacheData = JSON.parse(await sandbox.read('/cache/data.json'));

      expect(workspaceData.zone).toBe('workspace');
      expect(cacheData.zone).toBe('cache');
    });
  });
});
