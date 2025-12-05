import { describe, it, expect, beforeEach } from 'vitest';
import {
  createFilesystemTools,
  FilesystemToolset,
  createReadFileTool,
  createWriteFileTool,
  createListFilesTool,
  createDeleteFileTool,
  createStageForCommitTool,
  createFileExistsTool,
  createFileInfoTool,
} from './filesystem.js';
import {
  Sandbox,
  SandboxImpl,
  MemoryBackend,
  MemoryAuditLog,
  createSession,
  createSecurityContext,
  Zone,
  TrustLevel,
} from '../sandbox/index.js';
import { BlockedError } from '../approval/index.js';

/**
 * Helper to create a test sandbox.
 */
async function createTestSandbox(options: {
  trustLevel?: TrustLevel;
  sessionId?: string;
} = {}): Promise<{
  sandbox: Sandbox;
  backend: MemoryBackend;
}> {
  const backend = new MemoryBackend();
  const auditLog = new MemoryAuditLog();

  const session = createSession({
    id: options.sessionId || 'test-session',
    workspaceId: 'test-workspace',
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
  const sandbox = new SandboxImpl(backend, session, securityContext, auditLog);

  return { sandbox, backend };
}

describe('Filesystem Tools', () => {
  let sandbox: Sandbox;
  let backend: MemoryBackend;

  beforeEach(async () => {
    const result = await createTestSandbox();
    sandbox = result.sandbox;
    backend = result.backend;
  });

  describe('read_file', () => {
    it('reads file content', async () => {
      const tool = createReadFileTool(sandbox);

      // Write a file first
      await sandbox.write('/session/test-session/working/test.txt', 'hello world');

      // Read it using the tool
      const result = await tool.execute({ path: '/session/test-session/working/test.txt' });

      expect(result.success).toBe(true);
      expect(result.content).toBe('hello world');
      expect(result.size).toBe(11);
    });

    it('returns error for missing file', async () => {
      const tool = createReadFileTool(sandbox);

      const result = await tool.execute({ path: '/session/test-session/working/nonexistent.txt' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('returns error for permission denied', async () => {
      // Create sandbox with untrusted level
      const { sandbox: untrustedSandbox, backend: untrustedBackend } = await createTestSandbox({ trustLevel: 'untrusted' });
      const tool = createReadFileTool(untrustedSandbox);

      // Seed a file in workspace (not accessible to untrusted)
      untrustedBackend.seedFile('/data/secret.txt', 'secret');

      const result = await tool.execute({ path: '/workspace/data/secret.txt' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
      expect(result.hint).toContain('zones');
    });
  });

  describe('write_file', () => {
    it('writes file content', async () => {
      const tool = createWriteFileTool(sandbox);

      const result = await tool.execute({
        path: '/session/test-session/working/output.txt',
        content: 'new content',
      });

      expect(result.success).toBe(true);
      expect(result.bytesWritten).toBe(11);

      // Verify file was written
      const content = await sandbox.read('/session/test-session/working/output.txt');
      expect(content).toBe('new content');
    });

    it('returns error for permission denied', async () => {
      const { sandbox: untrustedSandbox } = await createTestSandbox({ trustLevel: 'untrusted' });
      const tool = createWriteFileTool(untrustedSandbox);

      const result = await tool.execute({
        path: '/workspace/data/hack.txt',
        content: 'malicious',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Permission denied');
    });
  });

  describe('list_files', () => {
    it('lists directory contents', async () => {
      const tool = createListFilesTool(sandbox);

      // Create some files
      await sandbox.write('/session/test-session/working/a.txt', 'a');
      await sandbox.write('/session/test-session/working/b.txt', 'b');

      const result = await tool.execute({ path: '/session/test-session/working' });

      expect(result.success).toBe(true);
      expect(result.files).toContain('a.txt');
      expect(result.files).toContain('b.txt');
      expect(result.count).toBe(2);
    });

    it('returns error for missing directory', async () => {
      const tool = createListFilesTool(sandbox);

      const result = await tool.execute({ path: '/session/test-session/nonexistent' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('delete_file', () => {
    it('deletes a file', async () => {
      const tool = createDeleteFileTool(sandbox);

      // Create a file
      await sandbox.write('/session/test-session/working/temp.txt', 'temp');
      expect(await sandbox.exists('/session/test-session/working/temp.txt')).toBe(true);

      // Delete it
      const result = await tool.execute({ path: '/session/test-session/working/temp.txt' });

      expect(result.success).toBe(true);
      expect(result.deleted).toBe(true);
      expect(await sandbox.exists('/session/test-session/working/temp.txt')).toBe(false);
    });

    it('returns error for missing file', async () => {
      const tool = createDeleteFileTool(sandbox);

      const result = await tool.execute({ path: '/session/test-session/working/nonexistent.txt' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('stage_for_commit', () => {
    it('stages files for commit', async () => {
      const tool = createStageForCommitTool(sandbox);

      const result = await tool.execute({
        files: [
          { path: 'docs/readme.md', content: '# Hello' },
          { path: 'docs/guide.md', content: '# Guide' },
        ],
        message: 'Add documentation',
      });

      expect(result.success).toBe(true);
      expect(result.commitId).toBeDefined();
      expect(result.stagedFiles).toBe(2);
      expect(result.paths).toContain('docs/readme.md');
      expect(result.paths).toContain('docs/guide.md');
    });
  });

  describe('file_exists', () => {
    it('returns true for existing file', async () => {
      const tool = createFileExistsTool(sandbox);

      await sandbox.write('/session/test-session/working/exists.txt', 'content');

      const result = await tool.execute({ path: '/session/test-session/working/exists.txt' });

      expect(result.success).toBe(true);
      expect(result.exists).toBe(true);
    });

    it('returns false for missing file', async () => {
      const tool = createFileExistsTool(sandbox);

      const result = await tool.execute({ path: '/session/test-session/working/missing.txt' });

      expect(result.success).toBe(true);
      expect(result.exists).toBe(false);
    });
  });

  describe('file_info', () => {
    it('returns file metadata', async () => {
      const tool = createFileInfoTool(sandbox);

      await sandbox.write('/session/test-session/working/info.txt', 'hello');

      const result = await tool.execute({ path: '/session/test-session/working/info.txt' });

      expect(result.success).toBe(true);
      expect(result.zone).toBe(Zone.SESSION);
      expect(result.size).toBe(5);
      expect(result.isDirectory).toBe(false);
      expect(result.createdAt).toBeDefined();
      expect(result.modifiedAt).toBeDefined();
    });
  });
});

describe('FilesystemToolset', () => {
  let sandbox: Sandbox;
  let toolset: FilesystemToolset;

  beforeEach(async () => {
    const { sandbox: s } = await createTestSandbox();
    sandbox = s;
    toolset = new FilesystemToolset(sandbox);
  });

  describe('getTools', () => {
    it('returns all filesystem tools', () => {
      const tools = toolset.getTools();

      const names = tools.map(t => t.name);
      expect(names).toContain('read_file');
      expect(names).toContain('write_file');
      expect(names).toContain('list_files');
      expect(names).toContain('delete_file');
      expect(names).toContain('stage_for_commit');
      expect(names).toContain('file_exists');
      expect(names).toContain('file_info');
    });
  });

  describe('needsApproval', () => {
    it('pre-approves file_exists (returns false)', () => {
      const result = toolset.needsApproval('file_exists', { path: '/session/test/file.txt' });
      expect(result).toBe(false);
    });

    it('requires approval for stage_for_commit (returns true)', () => {
      const result = toolset.needsApproval('stage_for_commit', {
        files: [{ path: 'test.md', content: 'content' }],
        message: 'test',
      });
      expect(result).toBe(true);
    });

    it('pre-approves allowed operations (returns false)', () => {
      const result = toolset.needsApproval('read_file', {
        path: '/session/test-session/working/file.txt',
      });
      expect(result).toBe(false);
    });

    it('throws BlockedError for disallowed operations', async () => {
      // Create toolset with untrusted sandbox
      const { sandbox: untrustedSandbox } = await createTestSandbox({ trustLevel: 'untrusted' });
      const untrustedToolset = new FilesystemToolset(untrustedSandbox);

      expect(() => untrustedToolset.needsApproval('read_file', {
        path: '/repo/secret.txt',
      })).toThrow(BlockedError);
    });
  });

  describe('getApprovalDescription', () => {
    it('describes read_file', () => {
      const desc = toolset.getApprovalDescription('read_file', {
        path: '/session/test/file.txt',
      });
      expect(desc).toContain('Read file');
      expect(desc).toContain('/session/test/file.txt');
    });

    it('describes write_file with size', () => {
      const desc = toolset.getApprovalDescription('write_file', {
        path: '/session/test/file.txt',
        content: 'hello world',
      });
      expect(desc).toContain('Write');
      expect(desc).toContain('11 bytes');
    });

    it('describes stage_for_commit', () => {
      const desc = toolset.getApprovalDescription('stage_for_commit', {
        files: [
          { path: 'a.md', content: 'a' },
          { path: 'b.md', content: 'b' },
        ],
        message: 'Add files',
      });
      expect(desc).toContain('Stage 2 file(s)');
      expect(desc).toContain('a.md');
      expect(desc).toContain('b.md');
      expect(desc).toContain('Add files');
    });
  });
});

describe('createFilesystemTools', () => {
  it('returns all tools', async () => {
    const { sandbox } = await createTestSandbox();
    const tools = createFilesystemTools(sandbox);

    expect(tools.length).toBe(7);
  });
});
