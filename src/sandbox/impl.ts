/**
 * Sandbox Implementation
 *
 * Core sandbox class that provides filesystem abstraction.
 */

import { Zone, FileStat, SandboxConfig } from './types.js';
import { Sandbox, SandboxBackend } from './interface.js';
import { InvalidPathError } from './errors.js';
import { getZoneFromPath, isValidZonePath } from './zones.js';

/**
 * Core sandbox implementation.
 */
export class SandboxImpl implements Sandbox {
  private backend: SandboxBackend;

  constructor(backend: SandboxBackend) {
    this.backend = backend;
  }

  // ─────────────────────────────────────────────────────────────────────
  // File Operations
  // ─────────────────────────────────────────────────────────────────────

  async read(path: string): Promise<string> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);
    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    return this.backend.readFile(realPath);
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);
    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    return this.backend.readFileBinary(realPath);
  }

  async write(path: string, content: string): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);
    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    await this.backend.writeFile(realPath, content);
  }

  async writeBinary(path: string, content: Uint8Array): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);
    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    await this.backend.writeFileBinary(realPath, content);
  }

  async delete(path: string): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);
    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    await this.backend.deleteFile(realPath);
  }

  async exists(path: string): Promise<boolean> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);
    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    return this.backend.exists(realPath);
  }

  async list(path: string): Promise<string[]> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);
    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    return this.backend.listDir(realPath);
  }

  async stat(path: string): Promise<FileStat> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);
    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    const backendStat = await this.backend.stat(realPath);

    return {
      path: normalizedPath,
      ...backendStat,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Path Operations
  // ─────────────────────────────────────────────────────────────────────

  resolve(path: string): string {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);
    return this.backend.mapVirtualToReal(normalizedPath, zone);
  }

  getZone(path: string): Zone {
    const normalized = this.normalizePath(path);
    try {
      return getZoneFromPath(normalized);
    } catch {
      throw new InvalidPathError(`Cannot determine zone for path: ${path}`, path);
    }
  }

  isValidPath(path: string): boolean {
    try {
      const normalized = this.normalizePath(path);
      return isValidZonePath(normalized);
    } catch {
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────

  private normalizePath(path: string): string {
    const originalPath = path;

    // All paths must be absolute (start with /)
    if (!path.startsWith('/')) {
      throw new InvalidPathError(
        'Path must be absolute (start with /). Use /workspace/ or /cache/',
        originalPath
      );
    }

    // Resolve . and ..
    const segments = path.split('/');
    const resolved: string[] = [];

    for (const segment of segments) {
      if (segment === '' || segment === '.') continue;
      if (segment === '..') {
        if (resolved.length === 0) {
          throw new InvalidPathError('Path escape attempt detected', originalPath);
        }
        resolved.pop();
      } else {
        resolved.push(segment);
      }
    }

    if (resolved.length === 0) {
      throw new InvalidPathError('Path resolves to empty (no zone)', originalPath);
    }

    return '/' + resolved.join('/');
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Factory Functions
// ─────────────────────────────────────────────────────────────────────────

/**
 * Create a sandbox with the specified configuration.
 *
 * @example
 * // Direct mode - maps to real directories
 * const sandbox = await createSandbox({
 *   mode: 'direct',
 *   cache: './downloads',
 *   workspace: './reports',
 * });
 *
 * @example
 * // Sandboxed mode - all in .sandbox directory
 * const sandbox = await createSandbox({
 *   mode: 'sandboxed',
 *   root: '.sandbox',
 * });
 */
export async function createSandbox(config: SandboxConfig): Promise<Sandbox> {
  const { CLIBackend } = await import('./backends/cli.js');

  const backend = new CLIBackend();
  await backend.initialize({
    mode: config.mode,
    root: config.root,
    cache: config.cache,
    workspace: config.workspace,
  });

  return new SandboxImpl(backend);
}

/**
 * Create a test sandbox with in-memory backend.
 */
export async function createTestSandbox(): Promise<Sandbox> {
  const { MemoryBackend } = await import('./backends/memory.js');

  const backend = new MemoryBackend();
  await backend.initialize({
    mode: 'sandboxed',
  });

  return new SandboxImpl(backend);
}
