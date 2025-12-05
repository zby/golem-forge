import { describe, it, expect, beforeEach } from 'vitest';
import {
  createFilesystemTools,
  FilesystemToolset,
  createReadFileTool,
  createWriteFileTool,
  createListFilesTool,
  createDeleteFileTool,
  createFileExistsTool,
  createFileInfoTool,
} from './filesystem.js';
import {
  Sandbox,
  createTestSandbox,
} from '../sandbox/index.js';

describe('Filesystem Tools', () => {
  let sandbox: Sandbox;

  beforeEach(async () => {
    sandbox = await createTestSandbox();
  });

  describe('read_file', () => {
    it('reads file content', async () => {
      const tool = createReadFileTool(sandbox);

      // Write a file first
      await sandbox.write('/workspace/test.txt', 'hello world');

      // Read it using the tool
      const result = await tool.execute({ path: '/workspace/test.txt' });

      expect(result.success).toBe(true);
      expect(result.content).toBe('hello world');
      expect(result.size).toBe(11);
    });

    it('returns error for missing file', async () => {
      const tool = createReadFileTool(sandbox);

      const result = await tool.execute({ path: '/workspace/nonexistent.txt' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('write_file', () => {
    it('writes file content', async () => {
      const tool = createWriteFileTool(sandbox);

      const result = await tool.execute({
        path: '/workspace/output.txt',
        content: 'new content',
      });

      expect(result.success).toBe(true);
      expect(result.bytesWritten).toBe(11);

      // Verify file was written
      const content = await sandbox.read('/workspace/output.txt');
      expect(content).toBe('new content');
    });

    it('writes to cache zone', async () => {
      const tool = createWriteFileTool(sandbox);

      const result = await tool.execute({
        path: '/cache/data.json',
        content: '{"key": "value"}',
      });

      expect(result.success).toBe(true);

      // Verify file was written
      const content = await sandbox.read('/cache/data.json');
      expect(content).toBe('{"key": "value"}');
    });
  });

  describe('list_files', () => {
    it('lists directory contents', async () => {
      const tool = createListFilesTool(sandbox);

      // Create some files
      await sandbox.write('/workspace/a.txt', 'a');
      await sandbox.write('/workspace/b.txt', 'b');

      const result = await tool.execute({ path: '/workspace' });

      expect(result.success).toBe(true);
      expect(result.files).toContain('a.txt');
      expect(result.files).toContain('b.txt');
      expect(result.count).toBe(2);
    });

    it('returns error for missing directory', async () => {
      const tool = createListFilesTool(sandbox);

      const result = await tool.execute({ path: '/workspace/nonexistent' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('delete_file', () => {
    it('deletes a file', async () => {
      const tool = createDeleteFileTool(sandbox);

      // Create a file
      await sandbox.write('/workspace/temp.txt', 'temp');
      expect(await sandbox.exists('/workspace/temp.txt')).toBe(true);

      // Delete it
      const result = await tool.execute({ path: '/workspace/temp.txt' });

      expect(result.success).toBe(true);
      expect(result.deleted).toBe(true);
      expect(await sandbox.exists('/workspace/temp.txt')).toBe(false);
    });

    it('returns error for missing file', async () => {
      const tool = createDeleteFileTool(sandbox);

      const result = await tool.execute({ path: '/workspace/nonexistent.txt' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('file_exists', () => {
    it('returns true for existing file', async () => {
      const tool = createFileExistsTool(sandbox);

      await sandbox.write('/workspace/exists.txt', 'content');

      const result = await tool.execute({ path: '/workspace/exists.txt' });

      expect(result.success).toBe(true);
      expect(result.exists).toBe(true);
    });

    it('returns false for missing file', async () => {
      const tool = createFileExistsTool(sandbox);

      const result = await tool.execute({ path: '/workspace/missing.txt' });

      expect(result.success).toBe(true);
      expect(result.exists).toBe(false);
    });
  });

  describe('file_info', () => {
    it('returns file metadata', async () => {
      const tool = createFileInfoTool(sandbox);

      await sandbox.write('/workspace/info.txt', 'hello');

      const result = await tool.execute({ path: '/workspace/info.txt' });

      expect(result.success).toBe(true);
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
    sandbox = await createTestSandbox();
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
      expect(names).toContain('file_exists');
      expect(names).toContain('file_info');
      expect(tools.length).toBe(6);
    });
  });

  describe('needsApproval', () => {
    it('pre-approves file_exists (returns false)', () => {
      const result = toolset.needsApproval('file_exists', { path: '/workspace/file.txt' });
      expect(result).toBe(false);
    });

    it('pre-approves read_file (returns false)', () => {
      const result = toolset.needsApproval('read_file', { path: '/workspace/file.txt' });
      expect(result).toBe(false);
    });

    it('pre-approves write_file by default (returns false)', () => {
      const result = toolset.needsApproval('write_file', { path: '/workspace/file.txt', content: 'test' });
      expect(result).toBe(false);
    });
  });

  describe('needsApproval with worker config', () => {
    it('requires approval when worker config has write_approval', () => {
      const toolsetWithConfig = new FilesystemToolset({
        sandbox,
        workerSandboxConfig: {
          paths: {
            workspace: {
              root: '/workspace',
              write_approval: true,
            },
          },
        },
      });

      const result = toolsetWithConfig.needsApproval('write_file', {
        path: '/workspace/file.txt',
        content: 'test',
      });
      expect(result).toBe(true);
    });

    it('pre-approves when path does not match write_approval config', () => {
      const toolsetWithConfig = new FilesystemToolset({
        sandbox,
        workerSandboxConfig: {
          paths: {
            special: {
              root: '/workspace/special',
              write_approval: true,
            },
          },
        },
      });

      // This path doesn't match the special config
      const result = toolsetWithConfig.needsApproval('write_file', {
        path: '/cache/file.txt',
        content: 'test',
      });
      expect(result).toBe(false);
    });
  });

  describe('getApprovalDescription', () => {
    it('describes read_file', () => {
      const desc = toolset.getApprovalDescription('read_file', {
        path: '/workspace/file.txt',
      });
      expect(desc).toContain('Read file');
      expect(desc).toContain('/workspace/file.txt');
    });

    it('describes write_file with size', () => {
      const desc = toolset.getApprovalDescription('write_file', {
        path: '/workspace/file.txt',
        content: 'hello world',
      });
      expect(desc).toContain('Write');
      expect(desc).toContain('11 bytes');
    });

    it('describes delete_file', () => {
      const desc = toolset.getApprovalDescription('delete_file', {
        path: '/workspace/file.txt',
      });
      expect(desc).toContain('Delete file');
      expect(desc).toContain('/workspace/file.txt');
    });
  });
});

describe('createFilesystemTools', () => {
  it('returns all tools', async () => {
    const sandbox = await createTestSandbox();
    const tools = createFilesystemTools(sandbox);

    expect(tools.length).toBe(6);
  });
});
