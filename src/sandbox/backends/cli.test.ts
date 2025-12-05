import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { CLIBackend } from './cli.js';
import {
  Zone,
  createSandbox,
  NotFoundError,
} from '../index.js';

describe('CLIBackend', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('sandboxed mode', () => {
    let backend: CLIBackend;

    beforeEach(async () => {
      backend = new CLIBackend();
      await backend.initialize({
        mode: 'sandboxed',
        root: path.join(tempDir, '.sandbox'),
      });
    });

    it('creates sandbox directory structure', async () => {
      const sandboxDir = path.join(tempDir, '.sandbox');

      expect(await fs.access(sandboxDir).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(path.join(sandboxDir, 'cache')).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(path.join(sandboxDir, 'workspace')).then(() => true).catch(() => false)).toBe(true);
    });

    it('maps cache paths correctly', () => {
      const virtualPath = '/cache/downloads/doc.pdf';
      const realPath = backend.mapVirtualToReal(virtualPath, Zone.CACHE);

      expect(realPath).toBe(path.join(tempDir, '.sandbox', 'cache', 'downloads', 'doc.pdf'));
    });

    it('maps workspace paths correctly', () => {
      const virtualPath = '/workspace/reports/analysis.md';
      const realPath = backend.mapVirtualToReal(virtualPath, Zone.WORKSPACE);

      expect(realPath).toBe(path.join(tempDir, '.sandbox', 'workspace', 'reports', 'analysis.md'));
    });
  });

  describe('direct mode', () => {
    let backend: CLIBackend;
    let cacheDir: string;
    let workspaceDir: string;

    beforeEach(async () => {
      cacheDir = path.join(tempDir, 'my-downloads');
      workspaceDir = path.join(tempDir, 'my-reports');

      backend = new CLIBackend();
      await backend.initialize({
        mode: 'direct',
        cache: cacheDir,
        workspace: workspaceDir,
      });
    });

    it('creates specified directories', async () => {
      expect(await fs.access(cacheDir).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(workspaceDir).then(() => true).catch(() => false)).toBe(true);
    });

    it('maps cache paths to specified directory', () => {
      const virtualPath = '/cache/file.pdf';
      const realPath = backend.mapVirtualToReal(virtualPath, Zone.CACHE);

      expect(realPath).toBe(path.join(cacheDir, 'file.pdf'));
    });

    it('maps workspace paths to specified directory', () => {
      const virtualPath = '/workspace/report.md';
      const realPath = backend.mapVirtualToReal(virtualPath, Zone.WORKSPACE);

      expect(realPath).toBe(path.join(workspaceDir, 'report.md'));
    });

    it('reports correct mode', () => {
      expect(backend.getMode()).toBe('direct');
      expect(backend.getCacheDir()).toBe(cacheDir);
      expect(backend.getWorkspaceDir()).toBe(workspaceDir);
    });
  });

  describe('direct mode without cache', () => {
    let backend: CLIBackend;
    let workspaceDir: string;

    beforeEach(async () => {
      workspaceDir = path.join(tempDir, 'workspace');

      backend = new CLIBackend();
      await backend.initialize({
        mode: 'direct',
        workspace: workspaceDir,
      });
    });

    it('creates cache as subdirectory of workspace', async () => {
      const expectedCacheDir = path.join(workspaceDir, '.cache');
      expect(await fs.access(expectedCacheDir).then(() => true).catch(() => false)).toBe(true);
      expect(backend.getCacheDir()).toBe(expectedCacheDir);
    });
  });

  describe('file operations', () => {
    let backend: CLIBackend;

    beforeEach(async () => {
      backend = new CLIBackend();
      await backend.initialize({
        mode: 'sandboxed',
        root: path.join(tempDir, '.sandbox'),
      });
    });

    it('writes and reads files', async () => {
      const filePath = path.join(tempDir, '.sandbox', 'workspace', 'test.txt');

      await backend.writeFile(filePath, 'hello world');
      const content = await backend.readFile(filePath);

      expect(content).toBe('hello world');
    });

    it('writes and reads binary files', async () => {
      const filePath = path.join(tempDir, '.sandbox', 'cache', 'test.bin');
      const data = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);

      await backend.writeFileBinary(filePath, data);
      const content = await backend.readFileBinary(filePath);

      expect(content).toEqual(data);
    });

    it('throws NotFoundError for missing files', async () => {
      const filePath = path.join(tempDir, '.sandbox', 'workspace', 'nonexistent.txt');

      await expect(backend.readFile(filePath)).rejects.toThrow(NotFoundError);
    });

    it('checks file existence', async () => {
      const filePath = path.join(tempDir, '.sandbox', 'workspace', 'exists.txt');

      expect(await backend.exists(filePath)).toBe(false);

      await backend.writeFile(filePath, 'content');
      expect(await backend.exists(filePath)).toBe(true);
    });

    it('deletes files', async () => {
      const filePath = path.join(tempDir, '.sandbox', 'workspace', 'todelete.txt');

      await backend.writeFile(filePath, 'content');
      expect(await backend.exists(filePath)).toBe(true);

      await backend.deleteFile(filePath);
      expect(await backend.exists(filePath)).toBe(false);
    });

    it('lists directory contents', async () => {
      const dirPath = path.join(tempDir, '.sandbox', 'workspace');

      await backend.writeFile(path.join(dirPath, 'a.txt'), 'a');
      await backend.writeFile(path.join(dirPath, 'b.txt'), 'b');

      const files = await backend.listDir(dirPath);
      expect(files).toContain('a.txt');
      expect(files).toContain('b.txt');
    });

    it('returns file stats', async () => {
      const filePath = path.join(tempDir, '.sandbox', 'workspace', 'stats.txt');

      await backend.writeFile(filePath, 'hello');
      const stats = await backend.stat(filePath);

      expect(stats.size).toBe(5);
      expect(stats.isDirectory).toBe(false);
      expect(Object.prototype.toString.call(stats.createdAt)).toBe('[object Date]');
      expect(Object.prototype.toString.call(stats.modifiedAt)).toBe('[object Date]');
    });

    it('creates nested directories', async () => {
      const nestedDir = path.join(tempDir, '.sandbox', 'workspace', 'a', 'b', 'c');

      await backend.mkdir(nestedDir);
      expect(await backend.exists(nestedDir)).toBe(true);

      const stats = await backend.stat(nestedDir);
      expect(stats.isDirectory).toBe(true);
    });

    it('auto-creates parent directories on write', async () => {
      const filePath = path.join(tempDir, '.sandbox', 'workspace', 'deep', 'nested', 'file.txt');

      await backend.writeFile(filePath, 'deep content');
      const content = await backend.readFile(filePath);

      expect(content).toBe('deep content');
    });
  });
});

describe('createSandbox', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-factory-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('creates a sandboxed mode sandbox', async () => {
    const sandbox = await createSandbox({
      mode: 'sandboxed',
      root: path.join(tempDir, '.sandbox'),
    });

    await sandbox.write('/workspace/test.txt', 'hello');
    const content = await sandbox.read('/workspace/test.txt');
    expect(content).toBe('hello');

    // Verify file exists in the real location
    const realPath = path.join(tempDir, '.sandbox', 'workspace', 'test.txt');
    const realContent = await fs.readFile(realPath, 'utf-8');
    expect(realContent).toBe('hello');
  });

  it('creates a direct mode sandbox', async () => {
    const workspaceDir = path.join(tempDir, 'reports');
    const cacheDir = path.join(tempDir, 'downloads');

    const sandbox = await createSandbox({
      mode: 'direct',
      workspace: workspaceDir,
      cache: cacheDir,
    });

    await sandbox.write('/workspace/report.md', '# Report');
    await sandbox.write('/cache/data.json', '{"key": "value"}');

    // Verify files are in direct locations
    expect(await fs.readFile(path.join(workspaceDir, 'report.md'), 'utf-8')).toBe('# Report');
    expect(await fs.readFile(path.join(cacheDir, 'data.json'), 'utf-8')).toBe('{"key": "value"}');
  });

  it('resolve returns real path', async () => {
    const workspaceDir = path.join(tempDir, 'workspace');

    const sandbox = await createSandbox({
      mode: 'direct',
      workspace: workspaceDir,
    });

    const realPath = sandbox.resolve('/workspace/file.txt');
    expect(realPath).toBe(path.join(workspaceDir, 'file.txt'));
  });

  it('works with nested paths', async () => {
    const sandbox = await createSandbox({
      mode: 'sandboxed',
      root: path.join(tempDir, '.sandbox'),
    });

    await sandbox.write('/workspace/a/b/c/deep.txt', 'deep');
    const content = await sandbox.read('/workspace/a/b/c/deep.txt');
    expect(content).toBe('deep');

    const files = await sandbox.list('/workspace/a/b/c');
    expect(files).toContain('deep.txt');
  });
});
