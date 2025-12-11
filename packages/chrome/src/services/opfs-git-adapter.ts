/**
 * OPFS to IsomorphicFs Adapter
 *
 * Adapts the OPFS (Origin Private File System) API to the node:fs-like
 * interface that isomorphic-git requires.
 *
 * This allows IsomorphicGitBackend to work with browser OPFS storage.
 *
 * Path handling:
 * - rootPath is the base directory in OPFS (e.g., "projects/my-program") // BACKCOMPAT: dir name remains "projects"
 * - All paths passed to fs methods are relative to this root
 * - isomorphic-git passes paths like ".git/config" or "src/file.ts"
 */

import type { IsomorphicFs } from '@golem-forge/core';

/**
 * Stat result compatible with isomorphic-git expectations.
 */
interface StatResult {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}

/**
 * Create an IsomorphicFs adapter from OPFS.
 *
 * @param rootPath - The OPFS root path for git operations (e.g., "projects/my-program") // BACKCOMPAT: dir name remains "projects"
 * @returns An IsomorphicFs-compatible object
 */
export async function createOPFSGitAdapter(rootPath: string): Promise<IsomorphicFs> {
  // Get the OPFS root directory
  const opfsRoot = await navigator.storage.getDirectory();

  // Normalize rootPath: remove leading/trailing slashes
  const normalizedRootPath = rootPath.replace(/^\/+|\/+$/g, '');
  const rootSegments = normalizedRootPath.split('/').filter(Boolean);

  // Navigate to and cache the root directory handle
  let rootDirHandle = opfsRoot;
  for (const segment of rootSegments) {
    rootDirHandle = await rootDirHandle.getDirectoryHandle(segment, { create: true });
  }

  /**
   * Normalize a path: remove leading slash, handle "." and empty paths.
   * Returns array of path segments relative to git root.
   */
  function normalizePath(path: string): string[] {
    // Remove leading slash and split
    const cleaned = path.replace(/^\/+/, '');
    if (!cleaned || cleaned === '.') {
      return [];
    }
    return cleaned.split('/').filter(Boolean);
  }

  /**
   * Navigate to a directory handle from the root.
   * Path is relative to the git root (rootDirHandle).
   */
  async function getDirectoryHandle(
    path: string,
    create = false
  ): Promise<FileSystemDirectoryHandle> {
    const segments = normalizePath(path);

    let current = rootDirHandle;
    for (const segment of segments) {
      try {
        current = await current.getDirectoryHandle(segment, { create });
      } catch (error) {
        if ((error as DOMException).name === 'NotFoundError') {
          throw Object.assign(new Error(`ENOENT: no such file or directory, '${path}'`), {
            code: 'ENOENT',
          });
        }
        throw error;
      }
    }
    return current;
  }

  /**
   * Get a file handle from a path relative to git root.
   */
  async function getFileHandle(
    path: string,
    create = false
  ): Promise<FileSystemFileHandle> {
    const segments = normalizePath(path);

    if (segments.length === 0) {
      throw Object.assign(new Error(`EISDIR: illegal operation on a directory, '${path}'`), {
        code: 'EISDIR',
      });
    }

    const fileName = segments.pop()!;

    // Get parent directory
    let dir: FileSystemDirectoryHandle;
    if (segments.length === 0) {
      dir = rootDirHandle;
    } else {
      try {
        dir = await getDirectoryHandle(segments.join('/'), create);
      } catch {
        throw Object.assign(new Error(`ENOENT: no such file or directory, '${path}'`), {
          code: 'ENOENT',
        });
      }
    }

    try {
      return await dir.getFileHandle(fileName, { create });
    } catch (error) {
      if ((error as DOMException).name === 'NotFoundError') {
        throw Object.assign(new Error(`ENOENT: no such file or directory, '${path}'`), {
          code: 'ENOENT',
        });
      }
      throw error;
    }
  }

  /**
   * Check if path is a file or directory.
   */
  async function statPath(path: string): Promise<StatResult & { type: 'file' | 'directory' }> {
    const segments = normalizePath(path);

    // Empty path = root directory
    if (segments.length === 0) {
      return {
        type: 'directory',
        isFile: () => false,
        isDirectory: () => true,
        isSymbolicLink: () => false,
      };
    }

    const lastName = segments.pop()!;

    // Get parent directory
    let parentDir: FileSystemDirectoryHandle;
    if (segments.length === 0) {
      parentDir = rootDirHandle;
    } else {
      try {
        parentDir = await getDirectoryHandle(segments.join('/'), false);
      } catch {
        throw Object.assign(new Error(`ENOENT: no such file or directory, '${path}'`), {
          code: 'ENOENT',
        });
      }
    }

    // Try as file first
    try {
      await parentDir.getFileHandle(lastName);
      return {
        type: 'file',
        isFile: () => true,
        isDirectory: () => false,
        isSymbolicLink: () => false,
      };
    } catch {
      // Not a file, try as directory
    }

    // Try as directory
    try {
      await parentDir.getDirectoryHandle(lastName);
      return {
        type: 'directory',
        isFile: () => false,
        isDirectory: () => true,
        isSymbolicLink: () => false,
      };
    } catch {
      throw Object.assign(new Error(`ENOENT: no such file or directory, '${path}'`), {
        code: 'ENOENT',
      });
    }
  }

  // Return IsomorphicFs interface
  return {
    promises: {
      // Read file - overloaded for text and binary
      async readFile(path: string, options?: { encoding: 'utf8' }): Promise<Uint8Array | string> {
        const handle = await getFileHandle(path);
        const file = await handle.getFile();

        if (options?.encoding === 'utf8') {
          return await file.text();
        }

        const buffer = await file.arrayBuffer();
        return new Uint8Array(buffer);
      },

      // Write file
      async writeFile(path: string, data: string | Uint8Array): Promise<void> {
        const handle = await getFileHandle(path, true);
        const writable = await handle.createWritable();

        if (typeof data === 'string') {
          await writable.write(data);
        } else {
          // Create a copy to avoid SharedArrayBuffer issues
          const buffer = new ArrayBuffer(data.byteLength);
          new Uint8Array(buffer).set(data);
          await writable.write(buffer);
        }

        await writable.close();
      },

      // Delete file
      async unlink(path: string): Promise<void> {
        const segments = normalizePath(path);

        if (segments.length === 0) {
          throw Object.assign(new Error(`EISDIR: illegal operation on a directory, '${path}'`), {
            code: 'EISDIR',
          });
        }

        const fileName = segments.pop()!;

        let dir: FileSystemDirectoryHandle;
        if (segments.length === 0) {
          dir = rootDirHandle;
        } else {
          dir = await getDirectoryHandle(segments.join('/'));
        }

        await dir.removeEntry(fileName);
      },

      // List directory
      async readdir(path: string): Promise<string[]> {
        const dir = await getDirectoryHandle(path);
        const entries: string[] = [];

        // @ts-expect-error - TypeScript doesn't know about async iterator
        for await (const key of dir.keys()) {
          entries.push(key);
        }

        return entries.sort();
      },

      // Create directory
      async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
        if (options?.recursive) {
          // Create each segment
          await getDirectoryHandle(path, true);
        } else {
          const segments = normalizePath(path);
          if (segments.length === 0) {
            return; // Root already exists
          }

          const dirName = segments.pop()!;

          let parentDir: FileSystemDirectoryHandle;
          if (segments.length === 0) {
            parentDir = rootDirHandle;
          } else {
            parentDir = await getDirectoryHandle(segments.join('/'));
          }

          await parentDir.getDirectoryHandle(dirName, { create: true });
        }
      },

      // Remove directory
      async rmdir(path: string): Promise<void> {
        const segments = normalizePath(path);

        if (segments.length === 0) {
          throw Object.assign(new Error(`EPERM: operation not permitted, '${path}'`), {
            code: 'EPERM',
          });
        }

        const dirName = segments.pop()!;

        let parentDir: FileSystemDirectoryHandle;
        if (segments.length === 0) {
          parentDir = rootDirHandle;
        } else {
          parentDir = await getDirectoryHandle(segments.join('/'));
        }

        await parentDir.removeEntry(dirName);
      },

      // Stat file/directory
      async stat(path: string): Promise<StatResult> {
        return statPath(path);
      },

      // Lstat (same as stat for OPFS - no symlinks)
      async lstat(path: string): Promise<StatResult> {
        return statPath(path);
      },
    },
  };
}

/**
 * Create an IsomorphicFs adapter for a sandbox's resolved root.
 *
 * @param sandboxRoot - The sandbox's root path (e.g., "/projects/my-program") // BACKCOMPAT: dir name remains "projects"
 * @returns An IsomorphicFs-compatible object
 */
export async function createSandboxGitAdapter(sandboxRoot: string): Promise<IsomorphicFs> {
  return createOPFSGitAdapter(sandboxRoot);
}
