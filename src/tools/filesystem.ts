/**
 * Filesystem Tools
 *
 * LLM tools for file operations using the sandbox interface.
 */

import { z } from 'zod';
import type { Tool, ToolExecutionOptions } from 'ai';
import {
  Sandbox,
  NotFoundError,
  isSandboxError,
} from '../sandbox/index.js';
import {
  type SupportsNeedsApproval,
  type SupportsApprovalDescription,
} from '../approval/index.js';
import type { SandboxConfig } from '../worker/schema.js';

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

const readFileSchema = z.object({
  path: z.string().describe('Path to the file. Use absolute paths like "/workspace/file.txt" or "/cache/file.txt"'),
});
type ReadFileInput = z.infer<typeof readFileSchema>;

/**
 * Create a read_file tool.
 */
export function createReadFileTool(sandbox: Sandbox): NamedTool {
  return {
    name: 'read_file',
    description: 'Read the contents of a file from the sandbox filesystem',
    inputSchema: readFileSchema,
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
  path: z.string().describe('Path to write to. Use absolute paths like "/workspace/file.txt"'),
  content: z.string().describe('Content to write to the file'),
});
type WriteFileInput = z.infer<typeof writeFileSchema>;

/**
 * Create a write_file tool.
 */
export function createWriteFileTool(sandbox: Sandbox): NamedTool {
  return {
    name: 'write_file',
    description: 'Write content to a file in the sandbox filesystem',
    inputSchema: writeFileSchema,
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
  path: z.string().describe('Directory path to list. Use "/workspace" or "/cache" or subdirectories'),
});
type ListFilesInput = z.infer<typeof listFilesSchema>;

/**
 * Create a list_files tool.
 */
export function createListFilesTool(sandbox: Sandbox): NamedTool {
  return {
    name: 'list_files',
    description: 'List files and directories in a sandbox directory',
    inputSchema: listFilesSchema,
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
  path: z.string().describe('Path to the file to delete'),
});
type DeleteFileInput = z.infer<typeof deleteFileSchema>;

/**
 * Create a delete_file tool.
 */
export function createDeleteFileTool(sandbox: Sandbox): NamedTool {
  return {
    name: 'delete_file',
    description: 'Delete a file from the sandbox filesystem',
    inputSchema: deleteFileSchema,
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
  path: z.string().describe('Path to check'),
});
type FileExistsInput = z.infer<typeof fileExistsSchema>;

/**
 * Create a file_exists tool.
 */
export function createFileExistsTool(sandbox: Sandbox): NamedTool {
  return {
    name: 'file_exists',
    description: 'Check if a file or directory exists in the sandbox',
    inputSchema: fileExistsSchema,
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
  path: z.string().describe('Path to the file'),
});
type FileInfoInput = z.infer<typeof fileInfoSchema>;

/**
 * Create a file_info tool.
 */
export function createFileInfoTool(sandbox: Sandbox): NamedTool {
  return {
    name: 'file_info',
    description: 'Get metadata about a file (size, dates, type)',
    inputSchema: fileInfoSchema,
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
  /** Worker's sandbox configuration for additional restrictions */
  workerSandboxConfig?: SandboxConfig;
}

/**
 * Toolset that provides all filesystem tools with approval logic.
 */
export class FilesystemToolset implements SupportsNeedsApproval<unknown>, SupportsApprovalDescription<unknown> {
  private sandbox: Sandbox;
  private workerSandboxConfig?: SandboxConfig;
  private tools: NamedTool[];

  constructor(sandboxOrOptions: Sandbox | FilesystemToolsetOptions) {
    // Support both old (Sandbox) and new (options) constructor signatures
    if ('read' in sandboxOrOptions) {
      // It's a Sandbox
      this.sandbox = sandboxOrOptions;
      this.workerSandboxConfig = undefined;
    } else {
      // It's options
      this.sandbox = sandboxOrOptions.sandbox;
      this.workerSandboxConfig = sandboxOrOptions.workerSandboxConfig;
    }

    this.tools = [
      createReadFileTool(this.sandbox),
      createWriteFileTool(this.sandbox),
      createListFilesTool(this.sandbox),
      createDeleteFileTool(this.sandbox),
      createFileExistsTool(this.sandbox),
      createFileInfoTool(this.sandbox),
    ];
  }

  /**
   * Get all filesystem tools.
   */
  getTools(): NamedTool[] {
    return this.tools;
  }

  /**
   * Determine if a tool needs approval.
   * In the simplified sandbox, we use worker config for approval decisions.
   * @returns true if approval is needed, false if pre-approved
   */
  needsApproval(name: string, args: Record<string, unknown>): boolean {
    const path = args.path as string | undefined;

    // Read operations are always allowed without approval
    if (name === 'file_exists' || name === 'read_file' || name === 'list_files' || name === 'file_info') {
      return false;
    }

    // Write/delete operations: check worker config
    if (path && (name === 'write_file' || name === 'delete_file')) {
      if (this.requiresWriteApprovalFromConfig(path)) {
        return true;
      }
    }

    // Default: pre-approved
    return false;
  }

  /**
   * Check if the worker's sandbox config requires write approval for this path.
   */
  private requiresWriteApprovalFromConfig(path: string): boolean {
    if (!this.workerSandboxConfig?.paths) {
      return false;
    }

    // Check each path config in the worker's sandbox config
    for (const [, pathConfig] of Object.entries(this.workerSandboxConfig.paths)) {
      // Check if this path matches the root pattern
      if (path.startsWith(pathConfig.root) || pathConfig.root === '*') {
        // Check if suffixes match (if specified)
        if (pathConfig.suffixes !== undefined) {
          const matchesSuffix = pathConfig.suffixes.some(suffix =>
            path.endsWith(suffix)
          );
          if (!matchesSuffix) {
            continue; // This path config doesn't apply
          }
        }

        // If write_approval is true for this path, require approval
        if (pathConfig.write_approval) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get a human-readable description for approval prompts.
   */
  getApprovalDescription(name: string, args: Record<string, unknown>): string {
    const path = args.path as string | undefined;

    switch (name) {
      case 'read_file':
        return `Read file: ${path}`;
      case 'write_file': {
        const content = args.content as string;
        const size = content?.length || 0;
        return `Write ${size} bytes to: ${path}`;
      }
      case 'list_files':
        return `List directory: ${path}`;
      case 'delete_file':
        return `Delete file: ${path}`;
      case 'file_exists':
        return `Check if exists: ${path}`;
      case 'file_info':
        return `Get file info: ${path}`;
      default:
        return `Execute ${name}`;
    }
  }
}

/**
 * Create all filesystem tools for a sandbox.
 * Convenience function that returns individual tools.
 */
export function createFilesystemTools(sandbox: Sandbox): NamedTool[] {
  return new FilesystemToolset(sandbox).getTools();
}
