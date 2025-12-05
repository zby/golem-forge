import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
  CLIBackend,
  FileAuditLog,
} from './cli.js';
import {
  Zone,
  createCLISandbox,
  NotFoundError,
  PermissionError,
} from '../index.js';

describe('CLIBackend', () => {
  let tempDir: string;
  let backend: CLIBackend;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sandbox-test-'));
    backend = new CLIBackend();
    await backend.initialize({
      workspaceId: 'test',
      sessionId: 'test-session',
      projectRoot: tempDir,
    });
  });

  afterEach(async () => {
    await backend.dispose();
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('initialization', () => {
    it('creates sandbox directory structure', async () => {
      const sandboxDir = path.join(tempDir, '.sandbox');

      expect(await fs.access(sandboxDir).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(path.join(sandboxDir, 'sessions', 'test-session', 'working')).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(path.join(sandboxDir, 'cache')).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(path.join(sandboxDir, 'data')).then(() => true).catch(() => false)).toBe(true);
      expect(await fs.access(path.join(sandboxDir, 'staged')).then(() => true).catch(() => false)).toBe(true);
    });
  });

  describe('file operations', () => {
    it('writes and reads files', async () => {
      const filePath = path.join(tempDir, '.sandbox', 'data', 'test.txt');

      await backend.writeFile(filePath, 'hello world');
      const content = await backend.readFile(filePath);

      expect(content).toBe('hello world');
    });

    it('writes and reads binary files', async () => {
      const filePath = path.join(tempDir, '.sandbox', 'data', 'test.bin');
      const data = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);

      await backend.writeFileBinary(filePath, data);
      const content = await backend.readFileBinary(filePath);

      expect(content).toEqual(data);
    });

    it('throws NotFoundError for missing files', async () => {
      const filePath = path.join(tempDir, '.sandbox', 'data', 'nonexistent.txt');

      await expect(backend.readFile(filePath)).rejects.toThrow(NotFoundError);
    });

    it('checks file existence', async () => {
      const filePath = path.join(tempDir, '.sandbox', 'data', 'exists.txt');

      expect(await backend.exists(filePath)).toBe(false);

      await backend.writeFile(filePath, 'content');
      expect(await backend.exists(filePath)).toBe(true);
    });

    it('deletes files', async () => {
      const filePath = path.join(tempDir, '.sandbox', 'data', 'todelete.txt');

      await backend.writeFile(filePath, 'content');
      expect(await backend.exists(filePath)).toBe(true);

      await backend.deleteFile(filePath);
      expect(await backend.exists(filePath)).toBe(false);
    });

    it('lists directory contents', async () => {
      const dirPath = path.join(tempDir, '.sandbox', 'data');

      await backend.writeFile(path.join(dirPath, 'a.txt'), 'a');
      await backend.writeFile(path.join(dirPath, 'b.txt'), 'b');

      const files = await backend.listDir(dirPath);
      expect(files).toContain('a.txt');
      expect(files).toContain('b.txt');
    });

    it('returns file stats', async () => {
      const filePath = path.join(tempDir, '.sandbox', 'data', 'stats.txt');

      await backend.writeFile(filePath, 'hello');
      const stats = await backend.stat(filePath);

      expect(stats.size).toBe(5);
      expect(stats.isDirectory).toBe(false);
      expect(Object.prototype.toString.call(stats.createdAt)).toBe('[object Date]');
      expect(Object.prototype.toString.call(stats.modifiedAt)).toBe('[object Date]');
    });

    it('creates nested directories', async () => {
      const nestedDir = path.join(tempDir, '.sandbox', 'data', 'a', 'b', 'c');

      await backend.mkdir(nestedDir);
      expect(await backend.exists(nestedDir)).toBe(true);

      const stats = await backend.stat(nestedDir);
      expect(stats.isDirectory).toBe(true);
    });
  });

  describe('path mapping', () => {
    it('maps session paths', () => {
      const virtualPath = '/session/test-session/working/file.txt';
      const realPath = backend.mapVirtualToReal(virtualPath, Zone.SESSION);

      expect(realPath).toBe(path.join(tempDir, '.sandbox', 'sessions', 'test-session', 'working', 'file.txt'));
    });

    it('maps workspace cache paths', () => {
      const virtualPath = '/workspace/cache/pdfs/doc.pdf';
      const realPath = backend.mapVirtualToReal(virtualPath, Zone.WORKSPACE);

      expect(realPath).toBe(path.join(tempDir, '.sandbox', 'cache', 'pdfs', 'doc.pdf'));
    });

    it('maps workspace data paths', () => {
      const virtualPath = '/workspace/data/notes.md';
      const realPath = backend.mapVirtualToReal(virtualPath, Zone.WORKSPACE);

      expect(realPath).toBe(path.join(tempDir, '.sandbox', 'data', 'notes.md'));
    });

    it('maps repo paths to project root', () => {
      const virtualPath = '/repo/src/main.ts';
      const realPath = backend.mapVirtualToReal(virtualPath, Zone.REPO);

      expect(realPath).toBe(path.join(tempDir, 'src', 'main.ts'));
    });

    it('maps staged paths', () => {
      const virtualPath = '/staged/commit-1/file.md';
      const realPath = backend.mapVirtualToReal(virtualPath, Zone.STAGED);

      expect(realPath).toBe(path.join(tempDir, '.sandbox', 'staged', 'commit-1', 'file.md'));
    });

    it('maps real paths back to virtual', () => {
      const realPath = path.join(tempDir, '.sandbox', 'sessions', 'test-session', 'working', 'file.txt');
      const virtualPath = backend.mapRealToVirtual(realPath);

      expect(virtualPath).toBe('/session/test-session/working/file.txt');
    });

    it('maps repo real paths back to virtual', () => {
      const realPath = path.join(tempDir, 'src', 'main.ts');
      const virtualPath = backend.mapRealToVirtual(realPath);

      expect(virtualPath).toBe('/repo/src/main.ts');
    });

    it('returns null for paths outside sandbox', () => {
      const virtualPath = backend.mapRealToVirtual('/some/random/path');
      expect(virtualPath).toBeNull();
    });
  });
});

describe('FileAuditLog', () => {
  let tempDir: string;
  let auditLog: FileAuditLog;
  let logPath: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-test-'));
    logPath = path.join(tempDir, 'audit.log');
    auditLog = new FileAuditLog(logPath);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('logs entries to file', async () => {
    await auditLog.log({
      operation: 'read',
      path: '/session/test/file.txt',
      zone: Zone.SESSION,
      sessionId: 'test-session',
      trustLevel: 'session',
      allowed: true,
    });

    // Verify file was created
    const content = await fs.readFile(logPath, 'utf-8');
    const entry = JSON.parse(content.trim());

    expect(entry.operation).toBe('read');
    expect(entry.path).toBe('/session/test/file.txt');
    expect(entry.allowed).toBe(true);
  });

  it('retrieves entries', async () => {
    await auditLog.log({
      operation: 'write',
      path: '/session/test/file.txt',
      zone: Zone.SESSION,
      sessionId: 'test-session',
      trustLevel: 'session',
      allowed: true,
    });

    const entries = await auditLog.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0].operation).toBe('write');
  });

  it('filters entries by session', async () => {
    await auditLog.log({
      operation: 'read',
      sessionId: 'session-1',
      trustLevel: 'session',
      allowed: true,
    });
    await auditLog.log({
      operation: 'read',
      sessionId: 'session-2',
      trustLevel: 'session',
      allowed: true,
    });

    const entries = await auditLog.getSessionEntries('session-1');
    expect(entries).toHaveLength(1);
    expect(entries[0].sessionId).toBe('session-1');
  });

  it('gets violations', async () => {
    await auditLog.log({
      operation: 'read',
      sessionId: 'test',
      trustLevel: 'session',
      allowed: true,
    });
    await auditLog.log({
      operation: 'security_violation',
      sessionId: 'test',
      trustLevel: 'untrusted',
      allowed: false,
      reason: 'Blocked',
    });

    const violations = await auditLog.getViolations();
    expect(violations).toHaveLength(1);
    expect(violations[0].operation).toBe('security_violation');
  });

  it('exports to JSON', async () => {
    await auditLog.log({
      operation: 'read',
      sessionId: 'test',
      trustLevel: 'session',
      allowed: true,
    });

    const exported = await auditLog.export();
    const parsed = JSON.parse(exported);

    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
  });

  it('prunes old entries', async () => {
    await auditLog.log({
      operation: 'read',
      sessionId: 'test',
      trustLevel: 'session',
      allowed: true,
    });

    // Prune entries older than now (should remove nothing since entry is new)
    const prunedNone = await auditLog.prune(new Date(0));
    expect(prunedNone).toBe(0);

    // Prune entries older than future (should remove all)
    const prunedAll = await auditLog.prune(new Date(Date.now() + 10000));
    expect(prunedAll).toBe(1);

    const remaining = await auditLog.getEntries();
    expect(remaining).toHaveLength(0);
  });
});

describe('createCLISandbox', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cli-sandbox-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('creates a working sandbox', async () => {
    const { sandbox, session } = await createCLISandbox({
      projectRoot: tempDir,
    });

    expect(session.trustLevel).toBe('session');
    expect(session.sourceContext.type).toBe('cli');

    // Write and read a file
    await sandbox.write(`/session/${session.id}/working/test.txt`, 'hello');
    const content = await sandbox.read(`/session/${session.id}/working/test.txt`);
    expect(content).toBe('hello');
  });

  it('respects trust level', async () => {
    const { sandbox, session } = await createCLISandbox({
      projectRoot: tempDir,
      trustLevel: 'untrusted',
    });

    expect(session.trustLevel).toBe('untrusted');

    // Should not be able to read repo
    await fs.writeFile(path.join(tempDir, 'secret.txt'), 'secret');
    await expect(sandbox.read('/repo/secret.txt')).rejects.toThrow(PermissionError);
  });

  it('uses custom session ID', async () => {
    const { session } = await createCLISandbox({
      projectRoot: tempDir,
      sessionId: 'my-custom-session',
    });

    expect(session.id).toBe('my-custom-session');
  });

  it('integrates with real filesystem', async () => {
    const { sandbox, session } = await createCLISandbox({
      projectRoot: tempDir,
      trustLevel: 'workspace',
    });

    // Create a file in repo
    await fs.writeFile(path.join(tempDir, 'readme.md'), '# Hello');

    // Read it through sandbox
    const content = await sandbox.read('/repo/readme.md');
    expect(content).toBe('# Hello');
  });
});
