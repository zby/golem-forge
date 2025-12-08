/**
 * Mount-based Sandbox Implementation
 *
 * Docker-style bind mount sandboxing.
 * See docs/notes/sandbox-mount-model.md for design details.
 */

import * as fs from 'fs/promises';
import * as nodePath from 'path';
import {
  MountSandboxConfig,
  MountSandboxConfigSchema,
  SubWorkerRestriction,
  ResolvedMount,
  ResolvedMountConfig,
} from './mount-types.js';
import { FileStat } from './types.js';
import { InvalidPathError, NotFoundError, SandboxError } from './errors.js';

/**
 * Mount-based sandbox interface.
 * Simpler than zone-based - just paths and permissions.
 */
export interface MountSandbox {
  // ─────────────────────────────────────────────────────────────────────────
  // File Operations
  // ─────────────────────────────────────────────────────────────────────────

  /** Read file content */
  read(path: string): Promise<string>;

  /** Read file as binary */
  readBinary(path: string): Promise<Uint8Array>;

  /** Write content to file */
  write(path: string, content: string): Promise<void>;

  /** Write binary content */
  writeBinary(path: string, content: Uint8Array): Promise<void>;

  /** Delete file */
  delete(path: string): Promise<void>;

  /** Check if path exists */
  exists(path: string): Promise<boolean>;

  /** List directory contents */
  list(path: string): Promise<string[]>;

  /** Get file metadata */
  stat(path: string): Promise<FileStat>;

  // ─────────────────────────────────────────────────────────────────────────
  // Path Operations
  // ─────────────────────────────────────────────────────────────────────────

  /** Resolve virtual path to real filesystem path */
  resolve(path: string): string;

  /** Check if path is within sandbox boundaries */
  isValidPath(path: string): boolean;

  /** Check if path is writable */
  canWrite(path: string): boolean;

  // ─────────────────────────────────────────────────────────────────────────
  // Sub-worker Support
  // ─────────────────────────────────────────────────────────────────────────

  /** Create a restricted sandbox for a sub-worker */
  restrict(config: SubWorkerRestriction): MountSandbox;

  /** Get the effective configuration (for debugging/logging) */
  getConfig(): ResolvedMountConfig;
}

/**
 * Mount-based sandbox implementation.
 */
export class MountSandboxImpl implements MountSandbox {
  private config: ResolvedMountConfig;

  constructor(config: ResolvedMountConfig) {
    this.config = config;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // File Operations
  // ─────────────────────────────────────────────────────────────────────────

  async read(path: string): Promise<string> {
    const realPath = this.resolve(path);
    try {
      return await fs.readFile(realPath, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundError(path);
      }
      throw error;
    }
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const realPath = this.resolve(path);
    try {
      const buffer = await fs.readFile(realPath);
      return new Uint8Array(buffer);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundError(path);
      }
      throw error;
    }
  }

  async write(path: string, content: string): Promise<void> {
    this.checkWritable(path);
    const realPath = this.resolve(path);
    await fs.mkdir(nodePath.dirname(realPath), { recursive: true });
    await fs.writeFile(realPath, content, 'utf-8');
  }

  async writeBinary(path: string, content: Uint8Array): Promise<void> {
    this.checkWritable(path);
    const realPath = this.resolve(path);
    await fs.mkdir(nodePath.dirname(realPath), { recursive: true });
    await fs.writeFile(realPath, content);
  }

  async delete(path: string): Promise<void> {
    this.checkWritable(path);
    const realPath = this.resolve(path);
    try {
      await fs.unlink(realPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundError(path);
      }
      throw error;
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      const realPath = this.resolve(path);
      await fs.access(realPath);
      return true;
    } catch {
      return false;
    }
  }

  async list(path: string): Promise<string[]> {
    const realPath = this.resolve(path);
    try {
      const entries = await fs.readdir(realPath);
      return entries.sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundError(path);
      }
      throw error;
    }
  }

  async stat(path: string): Promise<FileStat> {
    const realPath = this.resolve(path);
    try {
      const stats = await fs.stat(realPath);
      return {
        path,
        size: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
        isDirectory: stats.isDirectory(),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundError(path);
      }
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Path Operations
  // ─────────────────────────────────────────────────────────────────────────

  resolve(path: string): string {
    const normalized = this.normalizePath(path);

    // Find matching mount (longest target match wins)
    const mount = this.findMount(normalized);

    let realPath: string;
    if (mount) {
      // Path matched a mount - use mount's source
      const relativePath = normalized.slice(mount.target.length) || '/';
      const cleanRelative = relativePath.startsWith('/')
        ? relativePath.slice(1)
        : relativePath;
      realPath = nodePath.join(mount.source, cleanRelative);
    } else {
      // Use root mount
      const cleanPath = normalized.startsWith('/') ? normalized.slice(1) : normalized;
      realPath = nodePath.join(this.config.root, cleanPath);
    }

    // Security check: ensure resolved path is within allowed boundaries
    this.validateRealPath(realPath, normalized);

    return realPath;
  }

  isValidPath(path: string): boolean {
    try {
      this.resolve(path);
      return true;
    } catch {
      return false;
    }
  }

  canWrite(path: string): boolean {
    try {
      const normalized = this.normalizePath(path);
      const mount = this.findMount(normalized);

      if (mount) {
        return !mount.readonly;
      }
      return !this.config.readonly;
    } catch {
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Sub-worker Support
  // ─────────────────────────────────────────────────────────────────────────

  restrict(restriction: SubWorkerRestriction): MountSandbox {
    // Start with current config
    let newRoot = this.config.root;
    let newReadonly = this.config.readonly;
    const newMounts: ResolvedMount[] = [];

    // Apply restriction
    if (restriction.restrict) {
      const restrictPath = this.normalizePath(restriction.restrict);

      // Check if restriction path matches a mount
      const matchingMount = this.findMount(restrictPath);

      if (matchingMount && matchingMount.target === restrictPath) {
        // Restricting to exactly a mount point - that becomes the new root
        newRoot = matchingMount.source;
        newReadonly = matchingMount.readonly || newReadonly;
      } else {
        // Restricting to a subdirectory
        const realPath = this.resolve(restrictPath);
        newRoot = realPath;
        // Check if the restricted path is within a readonly area
        if (matchingMount) {
          newReadonly = matchingMount.readonly || newReadonly;
        }
      }

      // Filter mounts to only include those under the restriction
      for (const mount of this.config.mounts) {
        if (mount.target.startsWith(restrictPath + '/') || mount.target === restrictPath) {
          // Adjust mount target relative to new root
          const newTarget = mount.target.slice(restrictPath.length) || '/';
          newMounts.push({
            source: mount.source,
            target: newTarget.startsWith('/') ? newTarget : '/' + newTarget,
            readonly: mount.readonly,
          });
        }
      }
    } else {
      // No path restriction - copy all mounts
      newMounts.push(...this.config.mounts);
    }

    // Apply readonly if requested (can only make more restrictive)
    if (restriction.readonly) {
      newReadonly = true;
      // Also make all mounts readonly
      for (const mount of newMounts) {
        mount.readonly = true;
      }
    }

    // Validate: cannot upgrade permissions
    if (!restriction.readonly && this.config.readonly) {
      throw new SandboxError(
        'PERMISSION_ESCALATION',
        'Cannot upgrade read-only sandbox to read-write',
        restriction.restrict || '/'
      );
    }

    return new MountSandboxImpl({
      root: newRoot,
      readonly: newReadonly,
      mounts: newMounts,
    });
  }

  getConfig(): ResolvedMountConfig {
    return { ...this.config, mounts: [...this.config.mounts] };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private normalizePath(path: string): string {
    // All paths must be absolute
    if (!path.startsWith('/')) {
      throw new InvalidPathError(
        `Path must be absolute (start with /): ${path}`,
        path
      );
    }

    // Resolve . and ..
    const segments = path.split('/');
    const resolved: string[] = [];

    for (const segment of segments) {
      if (segment === '' || segment === '.') continue;
      if (segment === '..') {
        if (resolved.length === 0) {
          throw new InvalidPathError('Path escape attempt detected', path);
        }
        resolved.pop();
      } else {
        resolved.push(segment);
      }
    }

    return '/' + resolved.join('/');
  }

  private findMount(normalizedPath: string): ResolvedMount | undefined {
    // Mounts are sorted by target length (longest first)
    // Find the first mount whose target is a prefix of the path
    for (const mount of this.config.mounts) {
      if (
        normalizedPath === mount.target ||
        normalizedPath.startsWith(mount.target + '/')
      ) {
        return mount;
      }
    }
    return undefined;
  }

  private validateRealPath(realPath: string, virtualPath: string): void {
    const absoluteReal = nodePath.resolve(realPath);

    // Check against root
    const absoluteRoot = nodePath.resolve(this.config.root);
    if (absoluteReal.startsWith(absoluteRoot + nodePath.sep) || absoluteReal === absoluteRoot) {
      return; // Within root
    }

    // Check against mounts
    for (const mount of this.config.mounts) {
      const absoluteMount = nodePath.resolve(mount.source);
      if (absoluteReal.startsWith(absoluteMount + nodePath.sep) || absoluteReal === absoluteMount) {
        return; // Within a mount
      }
    }

    throw new InvalidPathError(
      `Path resolves outside sandbox boundaries: ${virtualPath}`,
      virtualPath
    );
  }

  private checkWritable(path: string): void {
    if (!this.canWrite(path)) {
      throw new SandboxError(
        'READ_ONLY',
        `Cannot write to read-only path: ${path}`,
        path
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory Function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a mount-based sandbox.
 *
 * @example
 * // Simple read-write project access
 * const sandbox = createMountSandbox({
 *   root: "/home/user/project"
 * });
 *
 * @example
 * // Read-only access
 * const sandbox = createMountSandbox({
 *   root: "/home/user/project",
 *   readonly: true
 * });
 *
 * @example
 * // With additional mounts
 * const sandbox = createMountSandbox({
 *   root: "/home/user/project",
 *   mounts: [
 *     { source: "/home/user/.cache", target: "/cache", readonly: true }
 *   ]
 * });
 */
export function createMountSandbox(config: MountSandboxConfig): MountSandbox {
  // Validate and parse config
  const parsed = MountSandboxConfigSchema.parse(config);

  // Resolve paths to absolute
  const absoluteRoot = nodePath.resolve(parsed.root);

  // Process mounts
  const resolvedMounts: ResolvedMount[] = [];
  if (parsed.mounts) {
    for (const mount of parsed.mounts) {
      resolvedMounts.push({
        source: nodePath.resolve(mount.source),
        target: mount.target,
        readonly: mount.readonly ?? false,
      });
    }
  }

  // Sort mounts by target path length (longest first for matching)
  resolvedMounts.sort((a, b) => b.target.length - a.target.length);

  const resolvedConfig: ResolvedMountConfig = {
    root: absoluteRoot,
    readonly: parsed.readonly ?? false,
    mounts: resolvedMounts,
  };

  return new MountSandboxImpl(resolvedConfig);
}

/**
 * Create a mount-based sandbox asynchronously.
 * Verifies that root directory exists (or creates it).
 */
export async function createMountSandboxAsync(
  config: MountSandboxConfig
): Promise<MountSandbox> {
  const sandbox = createMountSandbox(config);
  const resolvedConfig = sandbox.getConfig();

  // Ensure root exists
  await fs.mkdir(resolvedConfig.root, { recursive: true });

  // Ensure mount sources exist
  for (const mount of resolvedConfig.mounts) {
    await fs.mkdir(mount.source, { recursive: true });
  }

  return sandbox;
}

/**
 * Create a test sandbox with a temporary directory.
 * Convenience function for tests.
 */
export async function createTestSandbox(): Promise<MountSandbox> {
  const tmpDir = await fs.mkdtemp('/tmp/test-sandbox-');
  return createMountSandbox({ root: tmpDir });
}
