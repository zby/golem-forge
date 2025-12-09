/**
 * OPFS to IsomorphicFs Adapter
 *
 * Adapts the OPFS (Origin Private File System) API to the node:fs-like
 * interface that isomorphic-git requires.
 *
 * This allows IsomorphicGitBackend to work with browser OPFS storage.
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
 * @param rootPath - The OPFS root path for git operations
 * @returns An IsomorphicFs-compatible object
 */
export async function createOPFSGitAdapter(rootPath: string): Promise<IsomorphicFs> {
  // Get the OPFS root directory
  const opfsRoot = await navigator.storage.getDirectory();

  /**
   * Navigate to a directory handle from path segments.
   * Creates intermediate directories if `create` is true.
   */
  async function getDirectoryHandle(
    path: string,
    create = false
  ): Promise<FileSystemDirectoryHandle> {
    // Normalize path: remove leading slash, combine with rootPath
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    const fullPath = rootPath.startsWith('/')
      ? rootPath.slice(1) + (normalizedPath ? '/' + normalizedPath : '')
      : rootPath + (normalizedPath ? '/' + normalizedPath : '');

    const segments = fullPath.split('/').filter(Boolean);

    let current = opfsRoot;
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
   * Get a file handle from a path.
   */
  async function getFileHandle(
    path: string,
    create = false
  ): Promise<FileSystemFileHandle> {
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    const fullPath = rootPath.startsWith('/')
      ? rootPath.slice(1) + '/' + normalizedPath
      : rootPath + '/' + normalizedPath;

    const segments = fullPath.split('/').filter(Boolean);
    const fileName = segments.pop();

    if (!fileName) {
      throw Object.assign(new Error(`EISDIR: illegal operation on a directory, '${path}'`), {
        code: 'EISDIR',
      });
    }

    const dirPath = segments.join('/');
    let dir: FileSystemDirectoryHandle;

    try {
      dir = await getDirectoryHandle('/' + dirPath, create);
    } catch {
      throw Object.assign(new Error(`ENOENT: no such file or directory, '${path}'`), {
        code: 'ENOENT',
      });
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
    const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
    const fullPath = rootPath.startsWith('/')
      ? rootPath.slice(1) + (normalizedPath ? '/' + normalizedPath : '')
      : rootPath + (normalizedPath ? '/' + normalizedPath : '');

    const segments = fullPath.split('/').filter(Boolean);

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
    const parentPath = segments.join('/');

    let parentDir: FileSystemDirectoryHandle;
    try {
      if (parentPath) {
        parentDir = await getDirectoryHandle('/' + parentPath, false);
      } else {
        parentDir = await getDirectoryHandle('/', false);
      }
    } catch {
      throw Object.assign(new Error(`ENOENT: no such file or directory, '${path}'`), {
        code: 'ENOENT',
      });
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
        const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
        const fullPath = rootPath.startsWith('/')
          ? rootPath.slice(1) + '/' + normalizedPath
          : rootPath + '/' + normalizedPath;

        const segments = fullPath.split('/').filter(Boolean);
        const fileName = segments.pop();

        if (!fileName) {
          throw Object.assign(new Error(`EISDIR: illegal operation on a directory, '${path}'`), {
            code: 'EISDIR',
          });
        }

        const dir = await getDirectoryHandle('/' + segments.join('/'));
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
          // Create only the last segment
          const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
          const fullPath = rootPath.startsWith('/')
            ? rootPath.slice(1) + '/' + normalizedPath
            : rootPath + '/' + normalizedPath;

          const segments = fullPath.split('/').filter(Boolean);
          const dirName = segments.pop();

          if (!dirName) {
            return; // Root already exists
          }

          const parentDir = await getDirectoryHandle('/' + segments.join('/'));
          await parentDir.getDirectoryHandle(dirName, { create: true });
        }
      },

      // Remove directory
      async rmdir(path: string): Promise<void> {
        const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
        const fullPath = rootPath.startsWith('/')
          ? rootPath.slice(1) + '/' + normalizedPath
          : rootPath + '/' + normalizedPath;

        const segments = fullPath.split('/').filter(Boolean);
        const dirName = segments.pop();

        if (!dirName) {
          throw Object.assign(new Error(`EPERM: operation not permitted, '${path}'`), {
            code: 'EPERM',
          });
        }

        const parentDir = await getDirectoryHandle('/' + segments.join('/'));
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
 * @param sandboxRoot - The sandbox's root path (e.g., "/projects/my-program")
 * @returns An IsomorphicFs-compatible object
 */
export async function createSandboxGitAdapter(sandboxRoot: string): Promise<IsomorphicFs> {
  return createOPFSGitAdapter(sandboxRoot);
}
