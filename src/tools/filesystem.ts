/**
 * Filesystem Tools
 *
 * LLM tools for file operations using the sandbox interface.
 * Uses AI SDK's native needsApproval for tool approval.
 */

import { z } from 'zod';
import type { Tool, ToolExecutionOptions } from 'ai';
import {
  Sandbox,
  NotFoundError,
  isSandboxError,
} from '../sandbox/index.js';
import { type ApprovalConfig } from '../approval/index.js';

/**
 * Result returned by filesystem tools.
 */
export interface FilesystemToolResult {
  success: boolean;
  error?: string;
  hint?: string;
  [key: string]: unknown;
}

/**
 * A named tool extends the AI SDK Tool with a name property.
 * The name is used for tool identification in our toolset management.
 *
 * We use `any` for the generic parameters to allow collecting tools
 * with different input types into arrays, following the AI SDK's ToolSet pattern.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NamedTool = Tool<any, any> & {
  name: string;
};

/**
 * Options for creating a filesystem tool.
 */
interface ToolOptions {
  /** Whether the tool needs approval before execution */
  needsApproval?: boolean;
}

const readFileSchema = z.object({
  path: z.string().describe('Absolute path to the file (e.g., /dirname/file.txt). Use list_files("/") to discover available directories.'),
});
type ReadFileInput = z.infer<typeof readFileSchema>;

/**
 * Create a read_file tool.
 */
export function createReadFileTool(sandbox: Sandbox, options?: ToolOptions): NamedTool {
  return {
    name: 'read_file',
    description: 'Read the contents of a file from the sandbox filesystem',
    inputSchema: readFileSchema,
    needsApproval: options?.needsApproval,
    execute: async ({ path }: ReadFileInput, _options: ToolExecutionOptions) => {
      try {
        const content = await sandbox.read(path);
        return {
          success: true,
          content,
          path,
          size: content.length,
        };
      } catch (error) {
        return handleError(error, path);
      }
    },
  };
}

const writeFileSchema = z.object({
  path: z.string().describe('Absolute path to write to (e.g., /dirname/file.txt). Use list_files("/") to discover available directories.'),
  content: z.string().describe('Content to write to the file'),
});
type WriteFileInput = z.infer<typeof writeFileSchema>;

/**
 * Create a write_file tool.
 */
export function createWriteFileTool(sandbox: Sandbox, options?: ToolOptions): NamedTool {
  return {
    name: 'write_file',
    description: 'Write content to a file in the sandbox filesystem',
    inputSchema: writeFileSchema,
    needsApproval: options?.needsApproval ?? true, // Default: requires approval
    execute: async ({ path, content }: WriteFileInput, _options: ToolExecutionOptions) => {
      try {
        await sandbox.write(path, content);
        return {
          success: true,
          path,
          bytesWritten: content.length,
        };
      } catch (error) {
        return handleError(error, path);
      }
    },
  };
}

const listFilesSchema = z.object({
  path: z.string().describe('Directory path to list. Use "/" to discover available directories.'),
});
type ListFilesInput = z.infer<typeof listFilesSchema>;

/**
 * Create a list_files tool.
 */
export function createListFilesTool(sandbox: Sandbox, options?: ToolOptions): NamedTool {
  return {
    name: 'list_files',
    description: 'List files and directories in a sandbox directory',
    inputSchema: listFilesSchema,
    needsApproval: options?.needsApproval,
    execute: async ({ path }: ListFilesInput, _options: ToolExecutionOptions) => {
      try {
        const files = await sandbox.list(path);
        return {
          success: true,
          path,
          files,
          count: files.length,
        };
      } catch (error) {
        return handleError(error, path);
      }
    },
  };
}

const deleteFileSchema = z.object({
  path: z.string().describe('Absolute path to the file to delete (e.g., /dirname/file.txt). Use list_files("/") to discover available directories.'),
});
type DeleteFileInput = z.infer<typeof deleteFileSchema>;

/**
 * Create a delete_file tool.
 */
export function createDeleteFileTool(sandbox: Sandbox, options?: ToolOptions): NamedTool {
  return {
    name: 'delete_file',
    description: 'Delete a file from the sandbox filesystem',
    inputSchema: deleteFileSchema,
    needsApproval: options?.needsApproval ?? true, // Default: requires approval
    execute: async ({ path }: DeleteFileInput, _options: ToolExecutionOptions) => {
      try {
        await sandbox.delete(path);
        return {
          success: true,
          path,
          deleted: true,
        };
      } catch (error) {
        return handleError(error, path);
      }
    },
  };
}

const fileExistsSchema = z.object({
  path: z.string().describe('Absolute path to check (e.g., /dirname/file.txt). Use list_files("/") to discover available directories.'),
});
type FileExistsInput = z.infer<typeof fileExistsSchema>;

/**
 * Create a file_exists tool.
 */
export function createFileExistsTool(sandbox: Sandbox, options?: ToolOptions): NamedTool {
  return {
    name: 'file_exists',
    description: 'Check if a file or directory exists in the sandbox',
    inputSchema: fileExistsSchema,
    needsApproval: options?.needsApproval,
    execute: async ({ path }: FileExistsInput, _options: ToolExecutionOptions) => {
      try {
        const exists = await sandbox.exists(path);
        return {
          success: true,
          path,
          exists,
        };
      } catch (error) {
        return handleError(error, path);
      }
    },
  };
}

const fileInfoSchema = z.object({
  path: z.string().describe('Absolute path to the file (e.g., /dirname/file.txt). Use list_files("/") to discover available directories.'),
});
type FileInfoInput = z.infer<typeof fileInfoSchema>;

/**
 * Create a file_info tool.
 */
export function createFileInfoTool(sandbox: Sandbox, options?: ToolOptions): NamedTool {
  return {
    name: 'file_info',
    description: 'Get metadata about a file (size, dates, type)',
    inputSchema: fileInfoSchema,
    needsApproval: options?.needsApproval,
    execute: async ({ path }: FileInfoInput, _options: ToolExecutionOptions) => {
      try {
        const stat = await sandbox.stat(path);
        return {
          success: true,
          path: stat.path,
          size: stat.size,
          isDirectory: stat.isDirectory,
          createdAt: stat.createdAt.toISOString(),
          modifiedAt: stat.modifiedAt.toISOString(),
        };
      } catch (error) {
        return handleError(error, path);
      }
    },
  };
}

/**
 * Handle errors and return LLM-friendly messages.
 */
function handleError(error: unknown, path?: string): FilesystemToolResult {
  if (error instanceof NotFoundError) {
    return {
      success: false,
      error: `File not found: ${path || 'unknown path'}`,
      hint: 'Please check the path and try again.',
      path,
    };
  }

  if (isSandboxError(error)) {
    return {
      success: false,
      error: error.toLLMMessage(),
      path,
    };
  }

  // Unknown error
  const message = error instanceof Error ? error.message : String(error);
  return {
    success: false,
    error: `Operation failed: ${message}`,
    path,
  };
}

/**
 * Options for creating a FilesystemToolset.
 */
export interface FilesystemToolsetOptions {
  sandbox: Sandbox;
  /**
   * Approval configuration for filesystem tools.
   * If not provided, uses secure defaults:
   * - read_file, list_files, file_exists, file_info: preApproved
   * - write_file, delete_file: needs approval
   */
  approvalConfig?: ApprovalConfig;
}

/**
 * Default approval configuration for filesystem tools.
 * Read operations don't need approval, write/delete do.
 */
const DEFAULT_FILESYSTEM_APPROVAL_CONFIG: ApprovalConfig = {
  read_file: { preApproved: true },
  list_files: { preApproved: true },
  file_exists: { preApproved: true },
  file_info: { preApproved: true },
  write_file: { preApproved: false },
  delete_file: { preApproved: false },
};

/**
 * Helper to convert ApprovalConfig to needsApproval boolean.
 * preApproved=true means needsApproval=false and vice versa.
 */
function configToNeedsApproval(config: ApprovalConfig, toolName: string): boolean | undefined {
  const toolConfig = config[toolName];
  if (!toolConfig) return undefined;
  // preApproved=true means no approval needed
  // preApproved=false (or undefined) means approval needed
  return !toolConfig.preApproved;
}

/**
 * Toolset that provides all filesystem tools.
 * Uses AI SDK's native needsApproval for tool approval.
 */
export class FilesystemToolset {
  private tools: NamedTool[];

  constructor(sandboxOrOptions: Sandbox | FilesystemToolsetOptions) {
    let sandbox: Sandbox;
    let approvalConfig: ApprovalConfig;

    // Support both old (Sandbox) and new (options) constructor signatures
    if ('read' in sandboxOrOptions) {
      // It's a Sandbox - use defaults
      sandbox = sandboxOrOptions;
      approvalConfig = DEFAULT_FILESYSTEM_APPROVAL_CONFIG;
    } else {
      // It's options - merge with defaults
      sandbox = sandboxOrOptions.sandbox;
      approvalConfig = {
        ...DEFAULT_FILESYSTEM_APPROVAL_CONFIG,
        ...sandboxOrOptions.approvalConfig,
      };
    }

    // Create tools with needsApproval set based on config
    this.tools = [
      createReadFileTool(sandbox, { needsApproval: configToNeedsApproval(approvalConfig, 'read_file') }),
      createWriteFileTool(sandbox, { needsApproval: configToNeedsApproval(approvalConfig, 'write_file') }),
      createListFilesTool(sandbox, { needsApproval: configToNeedsApproval(approvalConfig, 'list_files') }),
      createDeleteFileTool(sandbox, { needsApproval: configToNeedsApproval(approvalConfig, 'delete_file') }),
      createFileExistsTool(sandbox, { needsApproval: configToNeedsApproval(approvalConfig, 'file_exists') }),
      createFileInfoTool(sandbox, { needsApproval: configToNeedsApproval(approvalConfig, 'file_info') }),
    ];
  }

  /**
   * Get all filesystem tools.
   */
  getTools(): NamedTool[] {
    return this.tools;
  }
}

/**
 * Create all filesystem tools for a sandbox.
 * Convenience function that returns individual tools.
 */
export function createFilesystemTools(sandbox: Sandbox): NamedTool[] {
  return new FilesystemToolset(sandbox).getTools();
}
