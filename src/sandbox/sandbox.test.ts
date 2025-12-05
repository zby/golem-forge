import { describe, it, expect, beforeEach } from 'vitest';
import {
  Zone,
  TrustLevel,
  Sandbox,
  SandboxImpl,
  AuditingSandbox,
  MemoryBackend,
  MemoryAuditLog,
  createSession,
  createSecurityContext,
  PermissionError,
  NotFoundError,
  FileExistsError,
  InvalidPathError,
  getZoneFromPath,
  trustLevelDominates,
} from './index.js';

/**
 * Helper to create a test sandbox.
 */
async function createTestSandbox(options: {
  trustLevel?: TrustLevel;
  sessionId?: string;
  workspaceId?: string;
}): Promise<{
  sandbox: Sandbox;
  backend: MemoryBackend;
  auditLog: MemoryAuditLog;
}> {
  const backend = new MemoryBackend();
  const auditLog = new MemoryAuditLog();

  const session = createSession({
    id: options.sessionId || 'test-session',
    workspaceId: options.workspaceId || 'test-workspace',
    trustLevel: options.trustLevel || 'session',
    sourceContext: {
      type: 'cli',
      userInitiated: true,
    },
  });

  await backend.initialize({
    workspaceId: session.workspaceId,
    sessionId: session.id,
  });

  const securityContext = createSecurityContext(session.trustLevel, session);
  const coreSandbox = new SandboxImpl(backend, session, securityContext);
  const sandbox = new AuditingSandbox(coreSandbox, auditLog);

  return { sandbox, backend, auditLog };
}

describe('Sandbox', () => {
  describe('Zone Detection', () => {
    it('detects session zone', () => {
      expect(getZoneFromPath('/session/test/file.txt')).toBe(Zone.SESSION);
    });

    it('detects workspace zone', () => {
      expect(getZoneFromPath('/workspace/data/file.txt')).toBe(Zone.WORKSPACE);
    });

    it('detects repo zone', () => {
      expect(getZoneFromPath('/repo/src/main.ts')).toBe(Zone.REPO);
    });

    it('detects staged zone', () => {
      expect(getZoneFromPath('/staged/commit-1/file.md')).toBe(Zone.STAGED);
    });

    it('detects workers zone', () => {
      expect(getZoneFromPath('/workers/analyzer.worker')).toBe(Zone.WORKERS);
    });

    it('throws on unknown zone', () => {
      expect(() => getZoneFromPath('/unknown/file.txt')).toThrow();
    });
  });

  describe('Trust Level Hierarchy', () => {
    it('full dominates all', () => {
      expect(trustLevelDominates('full', 'full')).toBe(true);
      expect(trustLevelDominates('full', 'workspace')).toBe(true);
      expect(trustLevelDominates('full', 'session')).toBe(true);
      expect(trustLevelDominates('full', 'untrusted')).toBe(true);
    });

    it('untrusted dominated by all', () => {
      expect(trustLevelDominates('untrusted', 'untrusted')).toBe(true);
      expect(trustLevelDominates('untrusted', 'session')).toBe(false);
      expect(trustLevelDominates('untrusted', 'workspace')).toBe(false);
      expect(trustLevelDominates('untrusted', 'full')).toBe(false);
    });
  });

  describe('Session Trust Level', () => {
    let sandbox: Sandbox;
    let backend: MemoryBackend;

    beforeEach(async () => {
      const result = await createTestSandbox({ trustLevel: 'session' });
      sandbox = result.sandbox;
      backend = result.backend;
    });

    it('can write to session directory', async () => {
      await sandbox.write('/session/test-session/working/file.txt', 'hello');
      const content = await sandbox.read('/session/test-session/working/file.txt');
      expect(content).toBe('hello');
    });

    it('can write to workspace directory', async () => {
      await sandbox.write('/workspace/data/notes.md', 'my notes');
      const content = await sandbox.read('/workspace/data/notes.md');
      expect(content).toBe('my notes');
    });

    it('cannot read from repo', async () => {
      backend.seedFile('/repo/secret.txt', 'secret content');
      await expect(sandbox.read('/repo/secret.txt')).rejects.toThrow(PermissionError);
    });

    it('can write to staged directory', async () => {
      await sandbox.write('/staged/commit-1/file.md', 'content');
      const content = await sandbox.read('/staged/commit-1/file.md');
      expect(content).toBe('content');
    });

    it('can list session directory', async () => {
      await sandbox.write('/session/test-session/working/a.txt', 'a');
      await sandbox.write('/session/test-session/working/b.txt', 'b');
      const files = await sandbox.list('/session/test-session/working');
      expect(files).toContain('a.txt');
      expect(files).toContain('b.txt');
    });
  });

  describe('Untrusted Trust Level', () => {
    let sandbox: Sandbox;
    let backend: MemoryBackend;
    let auditLog: MemoryAuditLog;

    beforeEach(async () => {
      const result = await createTestSandbox({ trustLevel: 'untrusted' });
      sandbox = result.sandbox;
      backend = result.backend;
      auditLog = result.auditLog;
    });

    it('can write to own session', async () => {
      await sandbox.write('/session/test-session/working/file.txt', 'hello');
      const content = await sandbox.read('/session/test-session/working/file.txt');
      expect(content).toBe('hello');
    });

    it('cannot read from workspace', async () => {
      backend.seedFile('/data/existing.txt', 'existing content');
      await expect(sandbox.read('/workspace/data/existing.txt')).rejects.toThrow(PermissionError);
    });

    it('cannot read from repo', async () => {
      backend.seedFile('/repo/secret.txt', 'secret');
      await expect(sandbox.read('/repo/secret.txt')).rejects.toThrow(PermissionError);
    });

    it('cannot overwrite staged files', async () => {
      // First write succeeds
      await sandbox.write('/staged/commit-1/file.md', 'original');

      // Second write to same path fails
      await expect(
        sandbox.write('/staged/commit-1/file.md', 'malicious')
      ).rejects.toThrow(FileExistsError);
    });

    it('logs security violations', async () => {
      try {
        await sandbox.read('/repo/secret.txt');
      } catch {
        // Expected
      }

      const violations = await auditLog.getViolations();
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].trustLevel).toBe('untrusted');
    });

    it('cannot access other sessions (session isolation)', async () => {
      // Try to access another session's data
      await expect(
        sandbox.write('/session/other-session/working/file.txt', 'hack')
      ).rejects.toThrow(PermissionError);

      await expect(
        sandbox.read('/session/other-session/working/file.txt')
      ).rejects.toThrow(PermissionError);
    });

    it('cannot discard staged commits (delete permission)', async () => {
      // Stage a file first
      const commitId = await sandbox.stage(
        [{ repoPath: 'test.md', content: 'test' }],
        'Test commit'
      );

      // Untrusted cannot delete from staged zone
      await expect(sandbox.discardStaged(commitId)).rejects.toThrow(PermissionError);
    });
  });

  describe('Session Isolation', () => {
    it('prevents cross-session access at all trust levels', async () => {
      // Even session-level trust cannot access other sessions
      const { sandbox: sessionSandbox } = await createTestSandbox({
        trustLevel: 'session',
        sessionId: 'my-session',
      });

      await expect(
        sessionSandbox.write('/session/other-session/working/file.txt', 'content')
      ).rejects.toThrow(PermissionError);

      await expect(
        sessionSandbox.read('/session/other-session/working/file.txt')
      ).rejects.toThrow(PermissionError);

      await expect(
        sessionSandbox.list('/session/other-session/working')
      ).rejects.toThrow(PermissionError);
    });

    it('allows access to own session', async () => {
      const { sandbox: sessionSandbox } = await createTestSandbox({
        trustLevel: 'session',
        sessionId: 'my-session',
      });

      // Should work - accessing own session
      await sessionSandbox.write('/session/my-session/working/file.txt', 'content');
      const content = await sessionSandbox.read('/session/my-session/working/file.txt');
      expect(content).toBe('content');
    });
  });

  describe('Workspace Trust Level', () => {
    let sandbox: Sandbox;
    let backend: MemoryBackend;

    beforeEach(async () => {
      const result = await createTestSandbox({ trustLevel: 'workspace' });
      sandbox = result.sandbox;
      backend = result.backend;
    });

    it('can read from repo', async () => {
      backend.seedFile('/repo/readme.md', '# Hello');
      const content = await sandbox.read('/repo/readme.md');
      expect(content).toBe('# Hello');
    });

    it('cannot write to repo', async () => {
      await expect(
        sandbox.write('/repo/hack.txt', 'malicious')
      ).rejects.toThrow(PermissionError);
    });

    it('can list repo contents', async () => {
      backend.seedFile('/repo/src/main.ts', 'code');
      backend.seedFile('/repo/README.md', 'readme');
      const files = await sandbox.list('/repo');
      expect(files).toContain('src');
      expect(files).toContain('README.md');
    });
  });

  describe('Full Trust Level', () => {
    let sandbox: Sandbox;

    beforeEach(async () => {
      const result = await createTestSandbox({ trustLevel: 'full' });
      sandbox = result.sandbox;
    });

    it('can write to repo', async () => {
      await sandbox.write('/repo/new-file.md', 'content');
      const content = await sandbox.read('/repo/new-file.md');
      expect(content).toBe('content');
    });

    it('can delete from any zone', async () => {
      await sandbox.write('/session/test-session/working/temp.txt', 'temp');
      await sandbox.delete('/session/test-session/working/temp.txt');
      expect(await sandbox.exists('/session/test-session/working/temp.txt')).toBe(false);
    });
  });

  describe('Path Operations', () => {
    let sandbox: Sandbox;

    beforeEach(async () => {
      const result = await createTestSandbox({ trustLevel: 'session' });
      sandbox = result.sandbox;
    });

    it('resolves relative paths to session', () => {
      const resolved = sandbox.resolve('myfile.txt');
      expect(resolved).toBe('/session/test-session/working/myfile.txt');
    });

    it('resolves absolute paths unchanged', () => {
      const resolved = sandbox.resolve('/workspace/data/file.txt');
      expect(resolved).toBe('/workspace/data/file.txt');
    });

    it('normalizes paths with ..', () => {
      const resolved = sandbox.resolve('/session/test-session/working/../outputs/file.txt');
      expect(resolved).toBe('/session/test-session/outputs/file.txt');
    });

    it('validates paths correctly', () => {
      expect(sandbox.isValidPath('/session/test-session/file.txt')).toBe(true);
      expect(sandbox.isValidPath('/unknown/path')).toBe(false);
    });

    it('gets zone for path', () => {
      expect(sandbox.getZone('/session/test-session/file.txt')).toBe(Zone.SESSION);
      expect(sandbox.getZone('/workspace/data/file.txt')).toBe(Zone.WORKSPACE);
    });
  });

  describe('Staging Operations', () => {
    let sandbox: Sandbox;

    beforeEach(async () => {
      const result = await createTestSandbox({ trustLevel: 'session' });
      sandbox = result.sandbox;
    });

    it('stages files for commit', async () => {
      const commitId = await sandbox.stage(
        [
          { repoPath: 'docs/analysis.md', content: '# Analysis' },
          { repoPath: 'docs/summary.md', content: '# Summary' },
        ],
        'Add documentation'
      );

      expect(commitId).toBeDefined();

      const commit = await sandbox.getStagedCommit(commitId);
      expect(commit.message).toBe('Add documentation');
      expect(commit.files).toHaveLength(2);
      expect(commit.status).toBe('pending');
    });

    it('lists staged commits', async () => {
      await sandbox.stage(
        [{ repoPath: 'file1.md', content: 'content1' }],
        'Commit 1'
      );
      await sandbox.stage(
        [{ repoPath: 'file2.md', content: 'content2' }],
        'Commit 2'
      );

      const commits = await sandbox.getStagedCommits();
      expect(commits).toHaveLength(2);
    });

    it('discards staged commits', async () => {
      const commitId = await sandbox.stage(
        [{ repoPath: 'temp.md', content: 'temp' }],
        'Temporary'
      );

      await sandbox.discardStaged(commitId);

      await expect(sandbox.getStagedCommit(commitId)).rejects.toThrow(NotFoundError);
    });
  });

  describe('Session Management', () => {
    it('returns session info', async () => {
      const { sandbox } = await createTestSandbox({
        trustLevel: 'session',
        sessionId: 'my-session',
      });

      const session = sandbox.getSession();
      expect(session.id).toBe('my-session');
      expect(session.trustLevel).toBe('session');
    });

    it('returns session path', async () => {
      const { sandbox } = await createTestSandbox({ sessionId: 'test-123' });
      expect(sandbox.getSessionPath()).toBe('/session/test-123');
    });

    it('creates session subdirectories', async () => {
      const { sandbox } = await createTestSandbox({ sessionId: 'test-session' });
      const dirPath = await sandbox.createSessionDir('custom');
      expect(dirPath).toBe('/session/test-session/custom');
    });
  });

  describe('Security Context', () => {
    it('exposes security context', async () => {
      const { sandbox } = await createTestSandbox({ trustLevel: 'untrusted' });

      const ctx = sandbox.getSecurityContext();
      expect(ctx.trustLevel).toBe('untrusted');
      expect(ctx.permissions[Zone.REPO].readable).toBe(false);
      expect(ctx.permissions[Zone.SESSION].readable).toBe(true);
    });

    it('checks permissions correctly', async () => {
      const { sandbox } = await createTestSandbox({ trustLevel: 'session' });

      const sessionCheck = sandbox.checkPermission('read', '/session/test-session/file.txt');
      expect(sessionCheck.allowed).toBe(true);

      const repoCheck = sandbox.checkPermission('read', '/repo/file.txt');
      expect(repoCheck.allowed).toBe(false);
      expect(repoCheck.reason).toContain('repo');
    });
  });

  describe('Audit Logging', () => {
    it('logs all operations', async () => {
      const { sandbox, auditLog } = await createTestSandbox({ trustLevel: 'session' });

      await sandbox.write('/session/test-session/working/file.txt', 'content');
      await sandbox.read('/session/test-session/working/file.txt');
      await sandbox.list('/session/test-session/working');

      const entries = await auditLog.getSessionEntries('test-session');
      const operations = entries.map(e => e.operation);
      expect(operations).toContain('write');
      expect(operations).toContain('read');
      expect(operations).toContain('list');
    });

    it('filters entries by session', async () => {
      const result1 = await createTestSandbox({ sessionId: 'session-1' });
      const result2 = await createTestSandbox({ sessionId: 'session-2' });

      await result1.sandbox.write('/session/session-1/working/file.txt', 'a');
      await result2.sandbox.write('/session/session-2/working/file.txt', 'b');

      const session1Entries = await result1.auditLog.getSessionEntries('session-1');
      expect(session1Entries.every(e => e.sessionId === 'session-1')).toBe(true);
    });
  });

  describe('Binary Operations', () => {
    let sandbox: Sandbox;

    beforeEach(async () => {
      const result = await createTestSandbox({ trustLevel: 'session' });
      sandbox = result.sandbox;
    });

    it('writes and reads binary content', async () => {
      const content = new Uint8Array([0x89, 0x50, 0x4E, 0x47]); // PNG header
      await sandbox.writeBinary('/session/test-session/working/image.png', content);
      const read = await sandbox.readBinary('/session/test-session/working/image.png');
      expect(read).toEqual(content);
    });
  });

  describe('File Metadata', () => {
    let sandbox: Sandbox;

    beforeEach(async () => {
      const result = await createTestSandbox({ trustLevel: 'session' });
      sandbox = result.sandbox;
    });

    it('returns file stats', async () => {
      await sandbox.write('/session/test-session/working/file.txt', 'hello world');
      const stat = await sandbox.stat('/session/test-session/working/file.txt');

      expect(stat.path).toBe('/session/test-session/working/file.txt');
      expect(stat.zone).toBe(Zone.SESSION);
      expect(stat.size).toBe(11);
      expect(stat.isDirectory).toBe(false);
    });

    it('checks file existence', async () => {
      expect(await sandbox.exists('/session/test-session/working/nonexistent.txt')).toBe(false);

      await sandbox.write('/session/test-session/working/exists.txt', 'content');
      expect(await sandbox.exists('/session/test-session/working/exists.txt')).toBe(true);
    });
  });

  describe('Path Security', () => {
    let sandbox: Sandbox;

    beforeEach(async () => {
      const result = await createTestSandbox({ trustLevel: 'session' });
      sandbox = result.sandbox;
    });

    it('prevents path traversal escaping sandbox root', async () => {
      // Attempting to escape via .. should not reach outside sandbox
      await expect(
        sandbox.read('/session/../../../etc/passwd')
      ).rejects.toThrow(InvalidPathError);
    });

    it('normalizes paths with multiple .. segments', async () => {
      await sandbox.write('/session/test-session/working/file.txt', 'content');
      // This should resolve to /session/test-session/working/file.txt
      const content = await sandbox.read('/session/test-session/a/../working/b/../file.txt');
      expect(content).toBe('content');
    });

    it('handles paths that try to escape via excessive ..', async () => {
      // More .. than path depth should be caught
      await expect(
        sandbox.read('/session/../../../../../../../../etc/passwd')
      ).rejects.toThrow(InvalidPathError);
    });

    it('rejects empty zone after normalization', async () => {
      await expect(sandbox.read('/../..')).rejects.toThrow(InvalidPathError);
    });
  });

  describe('Deeply Nested Directories', () => {
    let sandbox: Sandbox;

    beforeEach(async () => {
      const result = await createTestSandbox({ trustLevel: 'session' });
      sandbox = result.sandbox;
    });

    it('creates deeply nested directories on write', async () => {
      // Write to a path with multiple non-existent parent directories
      await sandbox.write('/session/test-session/a/b/c/d/deep.txt', 'deep content');
      const content = await sandbox.read('/session/test-session/a/b/c/d/deep.txt');
      expect(content).toBe('deep content');
    });

    it('creates nested directories in workspace zone', async () => {
      await sandbox.write('/workspace/data/nested/path/here/file.txt', 'nested');
      const content = await sandbox.read('/workspace/data/nested/path/here/file.txt');
      expect(content).toBe('nested');
    });
  });

  describe('Workspace Path Mapping', () => {
    let sandbox: Sandbox;
    let backend: MemoryBackend;

    beforeEach(async () => {
      const result = await createTestSandbox({ trustLevel: 'session' });
      sandbox = result.sandbox;
      backend = result.backend;
    });

    it('maps /workspace/data paths correctly', async () => {
      await sandbox.write('/workspace/data/file.txt', 'data content');
      // Verify it's stored in the right backend location
      const files = backend.getFiles();
      expect(files.has('/data/file.txt')).toBe(true);
    });

    it('maps /workspace/cache paths correctly', async () => {
      await sandbox.write('/workspace/cache/temp.txt', 'cache content');
      const files = backend.getFiles();
      expect(files.has('/cache/temp.txt')).toBe(true);
    });

    it('handles workspace paths outside data/cache', async () => {
      // Custom subdirectory - should work or throw clear error
      await sandbox.write('/workspace/custom/file.txt', 'custom content');
      const content = await sandbox.read('/workspace/custom/file.txt');
      expect(content).toBe('custom content');
    });
  });

  describe('Audit Log Timing', () => {
    it('logs security violation before throwing error', async () => {
      const { sandbox, auditLog, backend } = await createTestSandbox({ trustLevel: 'untrusted' });
      backend.seedFile('/repo/secret.txt', 'secret');

      // Create a promise that resolves when a violation is logged
      let violationLogged = false;
      const originalLog = auditLog.log.bind(auditLog);
      auditLog.log = async (entry) => {
        if (entry.operation === 'security_violation') {
          violationLogged = true;
        }
        return originalLog(entry);
      };

      try {
        await sandbox.read('/repo/secret.txt');
      } catch {
        // Expected to throw
      }

      // The violation should have been logged BEFORE the error was thrown
      expect(violationLogged).toBe(true);
      const violations = await auditLog.getViolations();
      expect(violations.some(v => v.operation === 'security_violation')).toBe(true);
    });

    it('awaits audit log before throwing (async backend simulation)', async () => {
      const { sandbox, backend } = await createTestSandbox({ trustLevel: 'untrusted' });
      backend.seedFile('/repo/secret.txt', 'secret');

      // Track order of operations
      const operations: string[] = [];

      // Create a slow audit log that takes time to write
      const slowAuditLog = {
        log: async (entry: { operation: string }) => {
          if (entry.operation === 'security_violation') {
            // Simulate slow async write
            await new Promise(resolve => setTimeout(resolve, 10));
            operations.push('audit_logged');
          }
        },
        getEntries: async () => [],
        getSessionEntries: async () => [],
        getViolations: async () => [],
        export: async () => '[]',
        prune: async () => 0,
      };

      // Create sandbox with slow audit log
      const session = createSession({
        id: 'test-session',
        workspaceId: 'test-workspace',
        trustLevel: 'untrusted',
        sourceContext: { type: 'cli', userInitiated: true },
      });
      const securityContext = createSecurityContext('untrusted', session);
      const coreSandbox = new SandboxImpl(backend, session, securityContext);
      const slowSandbox = new AuditingSandbox(coreSandbox, slowAuditLog);

      try {
        await slowSandbox.read('/repo/secret.txt');
        operations.push('no_error'); // Should not reach here
      } catch {
        operations.push('error_thrown');
      }

      // If await is missing, error_thrown comes before audit_logged
      // If await is present, audit_logged comes before error_thrown
      expect(operations).toEqual(['audit_logged', 'error_thrown']);
    });
  });
});
