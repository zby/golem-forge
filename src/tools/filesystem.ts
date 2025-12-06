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
  getZoneNameFromPath,
  type ApprovalDecisionType,
} from '../sandbox/index.js';
import { type ApprovalConfig } from '../approval/index.js';

/**
 * Zone approval configuration map.
 * Maps zone names to their approval settings.
 */
export interface ZoneApprovalMap {
  [zoneName: string]: {
    write?: ApprovalDecisionType;
    delete?: ApprovalDecisionType;
  };
}

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
 * Function type for dynamic approval decisions.
 * Receives the tool input and returns whether approval is needed.
 */
type NeedsApprovalFn<T> = (input: T, options: ToolExecutionOptions) => boolean | Promise<boolean>;

/**
 * Options for creating a filesystem tool.
 */
interface ToolOptions<T = { path: string }> {
  /** Whether the tool needs approval before execution (static or dynamic) */
  needsApproval?: boolean | NeedsApprovalFn<T>;
}

const readFileSchema = z.object({
  path: z.string().describe('Absolute path to the file (e.g., /dirname/file.txt). Use list_files("/") to discover available directories.'),
});
type ReadFileInput = z.infer<typeof readFileSchema>;

/**
 * Known binary file extensions that should not be read as text.
 */
const BINARY_EXTENSIONS = new Set([
  // Documents
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp',
  // Images
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg', '.tiff', '.tif', '.heic', '.heif',
  // Audio/Video
  '.mp3', '.mp4', '.wav', '.avi', '.mov', '.mkv', '.flac', '.ogg', '.webm',
  // Archives
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar', '.xz',
  // Executables/Libraries
  '.exe', '.dll', '.so', '.dylib', '.bin', '.o', '.a',
  // Other binary
  '.wasm', '.pyc', '.class', '.sqlite', '.db',
]);

/**
 * Check if content appears to be binary (contains null bytes or invalid UTF-8).
 */
function isBinaryContent(content: string): boolean {
  // Check for null bytes - a strong indicator of binary content
  if (content.includes('\x00')) {
    return true;
  }
  // Check for high concentration of non-printable characters (except common whitespace)
  const nonPrintable = content.match(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]/g);
  if (nonPrintable && nonPrintable.length > content.length * 0.1) {
    return true;
  }
  return false;
}

/**
 * Get file extension from path (lowercase).
 */
function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  if (lastDot === -1 || lastDot === filePath.length - 1) return '';
  return filePath.slice(lastDot).toLowerCase();
}

/**
 * Create a read_file tool.
 */
export function createReadFileTool(sandbox: Sandbox, options?: ToolOptions): NamedTool {
  return {
    name: 'read_file',
    description: 'Read the contents of a text file from the sandbox filesystem. Cannot read binary files (images, PDFs, etc.).',
    inputSchema: readFileSchema,
    needsApproval: options?.needsApproval,
    execute: async ({ path }: ReadFileInput, _options: ToolExecutionOptions) => {
      try {
        // Check extension first (fast path)
        const ext = getExtension(path);
        if (BINARY_EXTENSIONS.has(ext)) {
          return {
            success: false,
            error: `Cannot read binary file: ${path}`,
            hint: `Files with extension '${ext}' are binary and cannot be read as text. Use file_info to get metadata, or pass the file as an attachment to a worker that can process it.`,
            path,
          };
        }

        const content = await sandbox.read(path);

        // Check content for binary data (catches files with wrong/no extension)
        if (isBinaryContent(content)) {
          return {
            success: false,
            error: `File appears to be binary: ${path}`,
            hint: 'This file contains binary data and cannot be read as text. Use file_info to get metadata, or pass the file as an attachment to a worker that can process it.',
            path,
          };
        }

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
   * Approval configuration for filesystem tools (static, per-tool).
   * If not provided, uses secure defaults:
   * - read_file, list_files, file_exists, file_info: preApproved
   * - write_file, delete_file: needs approval
   *
   * @deprecated Use zoneApprovalConfig for zone-aware approval instead.
   */
  approvalConfig?: ApprovalConfig;
  /**
   * Zone-aware approval configuration.
   * Maps zone names to their approval settings for write/delete operations.
   * Takes precedence over approvalConfig when provided.
   *
   * @example
   * ```typescript
   * {
   *   scratch: { write: 'preApproved', delete: 'preApproved' },
   *   output: { write: 'ask', delete: 'blocked' },
   * }
   * ```
   */
  zoneApprovalConfig?: ZoneApprovalMap;
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
 * Create a zone-aware approval function for write or delete operations.
 *
 * The function checks the zone from the path argument and returns whether
 * approval is needed based on the zone's approval config.
 *
 * @param zoneConfig - Map of zone names to their approval settings
 * @param operation - 'write' or 'delete'
 * @returns A function that takes tool input and returns whether approval is needed
 */
function createZoneAwareApproval(
  zoneConfig: ZoneApprovalMap,
  operation: 'write' | 'delete'
): NeedsApprovalFn<{ path: string }> {
  return (input: { path: string }) => {
    try {
      const zoneName = getZoneNameFromPath(input.path);
      const zoneApproval = zoneConfig[zoneName];

      if (!zoneApproval) {
        // Unknown zone - require approval (secure default)
        return true;
      }

      const decision = zoneApproval[operation];

      switch (decision) {
        case 'preApproved':
          return false;  // No approval needed
        case 'blocked':
          // Blocked operations still go through approval flow
          // The approval controller or sandbox will reject them
          return true;
        case 'ask':
        default:
          return true;  // Needs approval
      }
    } catch {
      // Invalid path or zone - require approval
      return true;
    }
  };
}

/**
 * Toolset that provides all filesystem tools.
 * Uses AI SDK's native needsApproval for tool approval.
 */
export class FilesystemToolset {
  private tools: NamedTool[];

  constructor(sandboxOrOptions: Sandbox | FilesystemToolsetOptions) {
    let sandbox: Sandbox;
    let zoneApprovalConfig: ZoneApprovalMap | undefined;
    let approvalConfig: ApprovalConfig;

    // Support both old (Sandbox) and new (options) constructor signatures
    if ('read' in sandboxOrOptions) {
      // It's a Sandbox - use defaults
      sandbox = sandboxOrOptions;
      approvalConfig = DEFAULT_FILESYSTEM_APPROVAL_CONFIG;
    } else {
      // It's options
      sandbox = sandboxOrOptions.sandbox;
      zoneApprovalConfig = sandboxOrOptions.zoneApprovalConfig;
      approvalConfig = {
        ...DEFAULT_FILESYSTEM_APPROVAL_CONFIG,
        ...sandboxOrOptions.approvalConfig,
      };
    }

    // Determine approval for write/delete operations
    // Zone-aware config takes precedence when provided
    const writeApproval = zoneApprovalConfig
      ? createZoneAwareApproval(zoneApprovalConfig, 'write')
      : configToNeedsApproval(approvalConfig, 'write_file');

    const deleteApproval = zoneApprovalConfig
      ? createZoneAwareApproval(zoneApprovalConfig, 'delete')
      : configToNeedsApproval(approvalConfig, 'delete_file');

    // Create tools with needsApproval set based on config
    // Read operations always use static config (no zone-based approval for reads)
    this.tools = [
      createReadFileTool(sandbox, { needsApproval: configToNeedsApproval(approvalConfig, 'read_file') }),
      createWriteFileTool(sandbox, { needsApproval: writeApproval }),
      createListFilesTool(sandbox, { needsApproval: configToNeedsApproval(approvalConfig, 'list_files') }),
      createDeleteFileTool(sandbox, { needsApproval: deleteApproval }),
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
