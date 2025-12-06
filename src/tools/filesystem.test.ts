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

    it('rejects files with known binary extensions', async () => {
      const tool = createReadFileTool(sandbox);

      // Test various binary extensions
      const binaryExtensions = ['.pdf', '.png', '.jpg', '.zip', '.exe', '.mp3'];

      for (const ext of binaryExtensions) {
        const result = await tool.execute({ path: `/workspace/file${ext}` });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Cannot read binary file');
        expect(result.hint).toContain('binary');
        expect(result.hint).toContain(ext);
      }
    });

    it('rejects files with binary content (null bytes)', async () => {
      const tool = createReadFileTool(sandbox);

      // Write a file with binary content (contains null bytes)
      const binaryContent = 'hello\x00world\x00binary';
      await sandbox.write('/workspace/binary.dat', binaryContent);

      const result = await tool.execute({ path: '/workspace/binary.dat' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('appears to be binary');
      expect(result.hint).toContain('binary data');
    });

    it('accepts text files with unusual but valid content', async () => {
      const tool = createReadFileTool(sandbox);

      // Write a file with unicode and special characters (but valid text)
      const textContent = 'Hello 世界! Ümlauts and émojis 🎉\nTabs\there\nNewlines\n\n';
      await sandbox.write('/workspace/unicode.txt', textContent);

      const result = await tool.execute({ path: '/workspace/unicode.txt' });

      expect(result.success).toBe(true);
      expect(result.content).toBe(textContent);
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

  describe('needsApproval on tools (SDK native pattern)', () => {
    it('read operations have needsApproval unset or false', () => {
      const tools = toolset.getTools();
      const readTool = tools.find(t => t.name === 'read_file');
      const listTool = tools.find(t => t.name === 'list_files');
      const existsTool = tools.find(t => t.name === 'file_exists');
      const infoTool = tools.find(t => t.name === 'file_info');

      // These should not need approval (false or undefined)
      expect(readTool?.needsApproval).toBeFalsy();
      expect(listTool?.needsApproval).toBeFalsy();
      expect(existsTool?.needsApproval).toBeFalsy();
      expect(infoTool?.needsApproval).toBeFalsy();
    });

    it('write_file has needsApproval=true by default', () => {
      const tools = toolset.getTools();
      const writeTool = tools.find(t => t.name === 'write_file');
      expect(writeTool?.needsApproval).toBe(true);
    });

    it('delete_file has needsApproval=true by default', () => {
      const tools = toolset.getTools();
      const deleteTool = tools.find(t => t.name === 'delete_file');
      expect(deleteTool?.needsApproval).toBe(true);
    });
  });

  describe('custom approvalConfig', () => {
    it('pre-approves write_file when configured', () => {
      const toolsetWithConfig = new FilesystemToolset({
        sandbox,
        approvalConfig: {
          write_file: { preApproved: true },
        },
      });

      const tools = toolsetWithConfig.getTools();
      const writeTool = tools.find(t => t.name === 'write_file');
      // preApproved: true means needsApproval should be false
      expect(writeTool?.needsApproval).toBe(false);
    });

    it('requires approval for delete even when write is pre-approved', () => {
      const toolsetWithConfig = new FilesystemToolset({
        sandbox,
        approvalConfig: {
          write_file: { preApproved: true },
        },
      });

      const tools = toolsetWithConfig.getTools();
      const deleteTool = tools.find(t => t.name === 'delete_file');
      // delete_file should still require approval (not affected by write config)
      expect(deleteTool?.needsApproval).toBe(true);
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

describe('Zone-aware approval', () => {
  let sandbox: Sandbox;

  beforeEach(async () => {
    sandbox = await createTestSandbox();
  });

  describe('zoneApprovalConfig', () => {
    it('uses function-based approval when zoneApprovalConfig is provided', () => {
      const toolset = new FilesystemToolset({
        sandbox,
        zoneApprovalConfig: {
          workspace: { write: 'preApproved', delete: 'ask' },
        },
      });

      const tools = toolset.getTools();
      const writeTool = tools.find(t => t.name === 'write_file');
      const deleteTool = tools.find(t => t.name === 'delete_file');

      // needsApproval should be a function, not a boolean
      expect(typeof writeTool?.needsApproval).toBe('function');
      expect(typeof deleteTool?.needsApproval).toBe('function');
    });

    it('preApproved zone returns false (no approval needed) for writes', async () => {
      const toolset = new FilesystemToolset({
        sandbox,
        zoneApprovalConfig: {
          workspace: { write: 'preApproved' },
        },
      });

      const tools = toolset.getTools();
      const writeTool = tools.find(t => t.name === 'write_file');

      // Call the needsApproval function with a path in the preApproved zone
      const needsApproval = writeTool?.needsApproval as (input: { path: string }) => boolean;
      expect(needsApproval({ path: '/workspace/file.txt' })).toBe(false);
    });

    it('ask zone returns true (needs approval) for writes', async () => {
      const toolset = new FilesystemToolset({
        sandbox,
        zoneApprovalConfig: {
          workspace: { write: 'ask' },
        },
      });

      const tools = toolset.getTools();
      const writeTool = tools.find(t => t.name === 'write_file');

      const needsApproval = writeTool?.needsApproval as (input: { path: string }) => boolean;
      expect(needsApproval({ path: '/workspace/file.txt' })).toBe(true);
    });

    it('blocked zone returns true (needs approval - will be blocked at execution)', async () => {
      const toolset = new FilesystemToolset({
        sandbox,
        zoneApprovalConfig: {
          workspace: { write: 'blocked' },
        },
      });

      const tools = toolset.getTools();
      const writeTool = tools.find(t => t.name === 'write_file');

      const needsApproval = writeTool?.needsApproval as (input: { path: string }) => boolean;
      expect(needsApproval({ path: '/workspace/file.txt' })).toBe(true);
    });

    it('unknown zone returns true (needs approval - secure default)', async () => {
      const toolset = new FilesystemToolset({
        sandbox,
        zoneApprovalConfig: {
          scratch: { write: 'preApproved' }, // only scratch is configured
        },
      });

      const tools = toolset.getTools();
      const writeTool = tools.find(t => t.name === 'write_file');

      const needsApproval = writeTool?.needsApproval as (input: { path: string }) => boolean;
      // workspace is not in config, so should require approval
      expect(needsApproval({ path: '/workspace/file.txt' })).toBe(true);
    });

    it('different zones can have different approval settings', async () => {
      const toolset = new FilesystemToolset({
        sandbox,
        zoneApprovalConfig: {
          workspace: { write: 'preApproved', delete: 'ask' },
          cache: { write: 'ask', delete: 'preApproved' },
        },
      });

      const tools = toolset.getTools();
      const writeTool = tools.find(t => t.name === 'write_file');
      const deleteTool = tools.find(t => t.name === 'delete_file');

      const writeNeedsApproval = writeTool?.needsApproval as (input: { path: string }) => boolean;
      const deleteNeedsApproval = deleteTool?.needsApproval as (input: { path: string }) => boolean;

      // workspace: write preApproved, delete ask
      expect(writeNeedsApproval({ path: '/workspace/file.txt' })).toBe(false);
      expect(deleteNeedsApproval({ path: '/workspace/file.txt' })).toBe(true);

      // cache: write ask, delete preApproved
      expect(writeNeedsApproval({ path: '/cache/file.txt' })).toBe(true);
      expect(deleteNeedsApproval({ path: '/cache/file.txt' })).toBe(false);
    });

    it('read operations still use static approval (not zone-aware)', () => {
      const toolset = new FilesystemToolset({
        sandbox,
        zoneApprovalConfig: {
          workspace: { write: 'preApproved' },
        },
      });

      const tools = toolset.getTools();
      const readTool = tools.find(t => t.name === 'read_file');
      const listTool = tools.find(t => t.name === 'list_files');

      // Read operations should still be static (falsy = no approval needed)
      expect(readTool?.needsApproval).toBeFalsy();
      expect(listTool?.needsApproval).toBeFalsy();
    });
  });
});

describe('Discoverable filesystem interface', () => {
  it('list_files("/") should return available zones as directories', async () => {
    // Create a sandbox with custom zones
    const { createSandbox } = await import('../sandbox/index.js');
    const sandbox = await createSandbox({
      mode: 'sandboxed',
      root: '/tmp/test-custom-zones',
      zones: {
        input: { path: './input', mode: 'ro' },
        output: { path: './output', mode: 'rw' },
      },
    });

    // Verify sandbox has custom zones
    expect(sandbox.getAvailableZones()).toEqual(['input', 'output']);

    // Create list_files tool
    const listTool = createListFilesTool(sandbox);

    // LLM should be able to discover available directories by listing root
    const result = await listTool.execute({ path: '/' });

    expect(result.success).toBe(true);
    expect(result.files).toContain('input');
    expect(result.files).toContain('output');
    // Should NOT see default zones that weren't configured
    expect(result.files).not.toContain('workspace');
    expect(result.files).not.toContain('cache');
  });

  it('tool descriptions should be generic, not hardcode zone names', async () => {
    const sandbox = await createTestSandbox();
    const toolset = new FilesystemToolset({ sandbox });
    const tools = toolset.getTools();

    const listTool = tools.find(t => t.name === 'list_files');
    expect(listTool).toBeDefined();

    // Access the Zod schema's path field description
    const schema = listTool!.inputSchema as { shape: { path: { _def: { description: string } } } };
    const pathDescription = schema.shape.path._def.description;

    // Description should guide LLM to discover directories, not hardcode them
    // This test will fail with current implementation - that's the point
    expect(pathDescription).not.toContain('/workspace');
    expect(pathDescription).not.toContain('/cache');
  });
});
