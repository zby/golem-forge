/**
 * Tests for Mount-based Sandbox
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createMountSandbox, createMountSandboxAsync } from './mount-sandbox.js';

describe('MountSandbox', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mount-sandbox-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('path resolution', () => {
    it('should resolve root paths correctly', () => {
      const sandbox = createMountSandbox({ root: tempDir });

      expect(sandbox.resolve('/')).toBe(tempDir);
      expect(sandbox.resolve('/foo.txt')).toBe(path.join(tempDir, 'foo.txt'));
      expect(sandbox.resolve('/src/app.ts')).toBe(path.join(tempDir, 'src/app.ts'));
    });

    it('should normalize paths with . and ..', () => {
      const sandbox = createMountSandbox({ root: tempDir });

      expect(sandbox.resolve('/src/./app.ts')).toBe(path.join(tempDir, 'src/app.ts'));
      expect(sandbox.resolve('/src/lib/../app.ts')).toBe(path.join(tempDir, 'src/app.ts'));
    });

    it('should reject path traversal attempts', () => {
      const sandbox = createMountSandbox({ root: tempDir });

      expect(() => sandbox.resolve('/../etc/passwd')).toThrow('escape');
      expect(() => sandbox.resolve('/../../etc/passwd')).toThrow('escape');
    });

    it('should reject relative paths', () => {
      const sandbox = createMountSandbox({ root: tempDir });

      expect(() => sandbox.resolve('foo.txt')).toThrow('absolute');
      expect(() => sandbox.resolve('./foo.txt')).toThrow('absolute');
    });

    it('should resolve mount paths correctly', async () => {
      const cacheDir = path.join(tempDir, 'cache-source');
      await fs.mkdir(cacheDir, { recursive: true });

      const sandbox = createMountSandbox({
        root: tempDir,
        mounts: [{ source: cacheDir, target: '/cache' }],
      });

      expect(sandbox.resolve('/cache')).toBe(cacheDir);
      expect(sandbox.resolve('/cache/pkg.tar')).toBe(path.join(cacheDir, 'pkg.tar'));
      expect(sandbox.resolve('/not-cache/file')).toBe(path.join(tempDir, 'not-cache/file'));
    });

    it('should match longest mount target first', async () => {
      const cacheDir = path.join(tempDir, 'cache-source');
      const npmCacheDir = path.join(tempDir, 'npm-cache-source');
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.mkdir(npmCacheDir, { recursive: true });

      const sandbox = createMountSandbox({
        root: tempDir,
        mounts: [
          { source: cacheDir, target: '/cache' },
          { source: npmCacheDir, target: '/cache/npm' },
        ],
      });

      // /cache/npm should match the more specific mount
      expect(sandbox.resolve('/cache/npm/pkg')).toBe(path.join(npmCacheDir, 'pkg'));
      // /cache/other should match /cache mount
      expect(sandbox.resolve('/cache/other')).toBe(path.join(cacheDir, 'other'));
    });

    it('should normalize trailing slashes in mount targets', async () => {
      const cacheDir = path.join(tempDir, 'cache-source');
      await fs.mkdir(cacheDir, { recursive: true });

      // Mount with trailing slash should still work
      const sandbox = createMountSandbox({
        root: tempDir,
        mounts: [{ source: cacheDir, target: '/cache/' }],
      });

      // Should match even though target had trailing slash
      expect(sandbox.resolve('/cache')).toBe(cacheDir);
      expect(sandbox.resolve('/cache/pkg.tar')).toBe(path.join(cacheDir, 'pkg.tar'));
    });
  });

  describe('file operations', () => {
    it('should read and write files', async () => {
      const sandbox = await createMountSandboxAsync({ root: tempDir });

      await sandbox.write('/test.txt', 'hello world');
      const content = await sandbox.read('/test.txt');

      expect(content).toBe('hello world');
    });

    it('should create parent directories when writing', async () => {
      const sandbox = await createMountSandboxAsync({ root: tempDir });

      await sandbox.write('/deep/nested/file.txt', 'content');
      const content = await sandbox.read('/deep/nested/file.txt');

      expect(content).toBe('content');
    });

    it('should list directory contents', async () => {
      const sandbox = await createMountSandboxAsync({ root: tempDir });

      await sandbox.write('/dir/a.txt', 'a');
      await sandbox.write('/dir/b.txt', 'b');
      await sandbox.write('/dir/c.txt', 'c');

      const entries = await sandbox.list('/dir');
      expect(entries).toEqual(['a.txt', 'b.txt', 'c.txt']);
    });

    it('should check file existence', async () => {
      const sandbox = await createMountSandboxAsync({ root: tempDir });

      await sandbox.write('/exists.txt', 'content');

      expect(await sandbox.exists('/exists.txt')).toBe(true);
      expect(await sandbox.exists('/not-exists.txt')).toBe(false);
    });

    it('should throw for invalid paths in exists()', async () => {
      const sandbox = await createMountSandboxAsync({ root: tempDir });

      // Relative paths should throw, not return false
      await expect(sandbox.exists('relative.txt')).rejects.toThrow('absolute');

      // Path traversal should throw, not return false
      await expect(sandbox.exists('/../escape')).rejects.toThrow('escape');
    });

    it('should delete files', async () => {
      const sandbox = await createMountSandboxAsync({ root: tempDir });

      await sandbox.write('/to-delete.txt', 'content');
      expect(await sandbox.exists('/to-delete.txt')).toBe(true);

      await sandbox.delete('/to-delete.txt');
      expect(await sandbox.exists('/to-delete.txt')).toBe(false);
    });

    it('should get file stats', async () => {
      const sandbox = await createMountSandboxAsync({ root: tempDir });

      await sandbox.write('/file.txt', 'hello');
      const stat = await sandbox.stat('/file.txt');

      expect(stat.path).toBe('/file.txt');
      expect(stat.size).toBe(5);
      expect(stat.isDirectory).toBe(false);
    });
  });

  describe('readonly mode', () => {
    it('should allow reads on readonly sandbox', async () => {
      // Create a file first
      const filePath = path.join(tempDir, 'file.txt');
      await fs.writeFile(filePath, 'content');

      const sandbox = createMountSandbox({ root: tempDir, readonly: true });

      const content = await sandbox.read('/file.txt');
      expect(content).toBe('content');
    });

    it('should block writes on readonly sandbox', async () => {
      const sandbox = await createMountSandboxAsync({ root: tempDir, readonly: true });

      await expect(sandbox.write('/file.txt', 'content')).rejects.toThrow('read-only');
    });

    it('should block deletes on readonly sandbox', async () => {
      // Create a file first
      const filePath = path.join(tempDir, 'file.txt');
      await fs.writeFile(filePath, 'content');

      const sandbox = createMountSandbox({ root: tempDir, readonly: true });

      await expect(sandbox.delete('/file.txt')).rejects.toThrow('read-only');
    });

    it('should respect readonly on mounts', async () => {
      const cacheDir = path.join(tempDir, 'cache');
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(path.join(cacheDir, 'data.txt'), 'cached');

      const sandbox = createMountSandbox({
        root: tempDir,
        mounts: [{ source: cacheDir, target: '/cache', readonly: true }],
      });

      // Can read from readonly mount
      expect(await sandbox.read('/cache/data.txt')).toBe('cached');

      // Cannot write to readonly mount
      await expect(sandbox.write('/cache/new.txt', 'data')).rejects.toThrow('read-only');

      // Can write to root (not readonly)
      await sandbox.write('/root-file.txt', 'data');
      expect(await sandbox.read('/root-file.txt')).toBe('data');
    });

    it('should report canWrite correctly', async () => {
      const cacheDir = path.join(tempDir, 'cache');
      await fs.mkdir(cacheDir, { recursive: true });

      const sandbox = createMountSandbox({
        root: tempDir,
        mounts: [{ source: cacheDir, target: '/cache', readonly: true }],
      });

      expect(sandbox.canWrite('/file.txt')).toBe(true);
      expect(sandbox.canWrite('/cache/file.txt')).toBe(false);
    });
  });

  describe('sub-worker restriction', () => {
    it('should restrict to subtree', async () => {
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.mkdir(path.join(tempDir, 'secrets'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'src', 'app.ts'), 'code');
      await fs.writeFile(path.join(tempDir, 'secrets', 'key.txt'), 'secret');

      const sandbox = createMountSandbox({ root: tempDir });
      const restricted = sandbox.restrict({ restrict: '/src' });

      // Can access files in /src (now at root)
      expect(await restricted.read('/app.ts')).toBe('code');

      // The restricted sandbox's root is now tempDir/src
      // So paths like /secrets would resolve to tempDir/src/secrets (within the sandbox)
      // NOT tempDir/secrets (outside the original restriction)
      const config = restricted.getConfig();
      expect(config.root).toBe(path.join(tempDir, 'src'));

      // Path traversal still blocked
      expect(() => restricted.resolve('/../secrets/key.txt')).toThrow();
    });

    it('should downgrade to readonly', async () => {
      const sandbox = await createMountSandboxAsync({ root: tempDir });
      const restricted = sandbox.restrict({ readonly: true });

      await expect(restricted.write('/file.txt', 'content')).rejects.toThrow('read-only');
    });

    it('should not allow upgrading readonly to readwrite', () => {
      const sandbox = createMountSandbox({ root: tempDir, readonly: true });

      expect(() => sandbox.restrict({ readonly: false })).toThrow('Cannot upgrade read-only');
    });

    it('should combine restriction and readonly', async () => {
      await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.writeFile(path.join(tempDir, 'src', 'app.ts'), 'code');

      const sandbox = createMountSandbox({ root: tempDir });
      const restricted = sandbox.restrict({ restrict: '/src', readonly: true });

      // Can read
      expect(await restricted.read('/app.ts')).toBe('code');

      // Cannot write
      await expect(restricted.write('/new.ts', 'code')).rejects.toThrow('read-only');
    });

    it('should preserve mounts under restriction', async () => {
      const srcDir = path.join(tempDir, 'src');
      const vendorDir = path.join(tempDir, 'vendor-source');
      await fs.mkdir(srcDir, { recursive: true });
      await fs.mkdir(vendorDir, { recursive: true });
      await fs.writeFile(path.join(vendorDir, 'lib.js'), 'vendor code');

      const sandbox = createMountSandbox({
        root: tempDir,
        mounts: [{ source: vendorDir, target: '/src/vendor' }],
      });

      const restricted = sandbox.restrict({ restrict: '/src' });

      // Vendor mount should now be at /vendor
      expect(await restricted.read('/vendor/lib.js')).toBe('vendor code');
    });

    it('should not mutate parent sandbox when restricting with readonly', async () => {
      const cacheDir = path.join(tempDir, 'cache');
      await fs.mkdir(cacheDir, { recursive: true });

      const sandbox = createMountSandbox({
        root: tempDir,
        mounts: [{ source: cacheDir, target: '/cache' }],
      });

      // Get parent config before restriction
      const parentConfigBefore = sandbox.getConfig();
      expect(parentConfigBefore.readonly).toBe(false);
      expect(parentConfigBefore.mounts[0].readonly).toBe(false);

      // Create restricted sandbox with readonly
      const restricted = sandbox.restrict({ readonly: true });

      // Verify restricted sandbox is readonly
      expect(restricted.getConfig().readonly).toBe(true);
      expect(restricted.getConfig().mounts[0].readonly).toBe(true);

      // Verify parent is NOT mutated
      const parentConfigAfter = sandbox.getConfig();
      expect(parentConfigAfter.readonly).toBe(false);
      expect(parentConfigAfter.mounts[0].readonly).toBe(false);

      // Verify parent can still write
      await sandbox.write('/file.txt', 'content');
      expect(await sandbox.read('/file.txt')).toBe('content');
    });
  });

  describe('getConfig', () => {
    it('should return the resolved configuration', () => {
      const cacheDir = path.join(tempDir, 'cache');

      const sandbox = createMountSandbox({
        root: tempDir,
        readonly: true,
        mounts: [{ source: cacheDir, target: '/cache' }],
      });

      const config = sandbox.getConfig();

      expect(config.root).toBe(path.resolve(tempDir));
      expect(config.readonly).toBe(true);
      expect(config.mounts).toHaveLength(1);
      expect(config.mounts[0].source).toBe(path.resolve(cacheDir));
      expect(config.mounts[0].target).toBe('/cache');
    });
  });

  describe('isValidPath', () => {
    it('should return true for valid paths', () => {
      const sandbox = createMountSandbox({ root: tempDir });

      expect(sandbox.isValidPath('/file.txt')).toBe(true);
      expect(sandbox.isValidPath('/dir/file.txt')).toBe(true);
      expect(sandbox.isValidPath('/')).toBe(true);
    });

    it('should return false for invalid paths', () => {
      const sandbox = createMountSandbox({ root: tempDir });

      expect(sandbox.isValidPath('relative.txt')).toBe(false);
      expect(sandbox.isValidPath('/../escape')).toBe(false);
    });
  });
});
