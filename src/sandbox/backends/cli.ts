/**
 * CLI Backend
 *
 * Node.js filesystem implementation of SandboxBackend.
 * Supports both sandboxed and direct modes.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { Zone, BackendConfig, BackendFileStat } from '../types.js';
import { SandboxBackend } from '../interface.js';
import { NotFoundError } from '../errors.js';

/**
 * CLI backend using Node.js filesystem.
 */
export class CLIBackend implements SandboxBackend {
  private mode: 'sandboxed' | 'direct' = 'sandboxed';
  private root: string = '.sandbox';
  private cacheDir: string = '';
  private workspaceDir: string = '';

  async initialize(config: BackendConfig): Promise<void> {
    this.mode = config.mode;

    if (config.mode === 'direct') {
      // Direct mode: use specified directories
      if (!config.workspace) {
        throw new Error('Direct mode requires workspace directory');
      }
      this.workspaceDir = path.resolve(config.workspace);
      this.cacheDir = config.cache ? path.resolve(config.cache) : path.join(this.workspaceDir, '.cache');
    } else {
      // Sandboxed mode: all in root directory
      this.root = path.resolve(config.root || '.sandbox');
      this.cacheDir = path.join(this.root, 'cache');
      this.workspaceDir = path.join(this.root, 'workspace');
    }

    // Create directories
    await fs.mkdir(this.cacheDir, { recursive: true });
    await fs.mkdir(this.workspaceDir, { recursive: true });
  }

  async dispose(): Promise<void> {
    // Nothing to clean up for CLI backend
  }

  async readFile(realPath: string): Promise<string> {
    try {
      return await fs.readFile(realPath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundError(realPath);
      }
      throw error;
    }
  }

  async readFileBinary(realPath: string): Promise<Uint8Array> {
    try {
      const buffer = await fs.readFile(realPath);
      return new Uint8Array(buffer);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundError(realPath);
      }
      throw error;
    }
  }

  async writeFile(realPath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(realPath), { recursive: true });
    await fs.writeFile(realPath, content, 'utf-8');
  }

  async writeFileBinary(realPath: string, content: Uint8Array): Promise<void> {
    await fs.mkdir(path.dirname(realPath), { recursive: true });
    await fs.writeFile(realPath, content);
  }

  async deleteFile(realPath: string): Promise<void> {
    try {
      await fs.unlink(realPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundError(realPath);
      }
      throw error;
    }
  }

  async exists(realPath: string): Promise<boolean> {
    try {
      await fs.access(realPath);
      return true;
    } catch {
      return false;
    }
  }

  async listDir(realPath: string): Promise<string[]> {
    try {
      const entries = await fs.readdir(realPath);
      return entries.sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundError(realPath);
      }
      throw error;
    }
  }

  async stat(realPath: string): Promise<BackendFileStat> {
    try {
      const stats = await fs.stat(realPath);
      return {
        size: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
        isDirectory: stats.isDirectory(),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundError(realPath);
      }
      throw error;
    }
  }

  async mkdir(realPath: string): Promise<void> {
    await fs.mkdir(realPath, { recursive: true });
  }

  mapVirtualToReal(virtualPath: string, zone: Zone): string {
    // Remove leading slash and zone prefix
    const normalized = virtualPath.startsWith('/') ? virtualPath.slice(1) : virtualPath;
    const segments = normalized.split('/');
    const relativePath = segments.slice(1).join('/'); // Remove zone segment

    switch (zone) {
      case Zone.CACHE:
        return path.join(this.cacheDir, relativePath);
      case Zone.WORKSPACE:
        return path.join(this.workspaceDir, relativePath);
      default:
        throw new Error(`Unknown zone: ${zone}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Getters for inspection
  // ─────────────────────────────────────────────────────────────────────

  getMode(): 'sandboxed' | 'direct' {
    return this.mode;
  }

  getCacheDir(): string {
    return this.cacheDir;
  }

  getWorkspaceDir(): string {
    return this.workspaceDir;
  }
}
