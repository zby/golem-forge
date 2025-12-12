/**
 * Mount-based Sandbox Implementation
 *
 * Docker-style bind mount sandboxing.
 * See docs/notes/sandbox-mount-model.md for design details.
 */

import * as fs from 'fs/promises';
import * as nodePath from 'path';
import type {
  MountSandboxConfig,
  SubWorkerRestriction,
  ResolvedMount,
  ResolvedMountConfig,
  FileStat,
  MountSandbox,
} from './mount-types.js';
import { MountSandboxConfigSchema } from './mount-types.js';
import { InvalidPathError, NotFoundError, SandboxError } from './errors.js';

// Re-export MountSandbox interface for consumers
export type { MountSandbox } from './mount-types.js';

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
    // resolve() can throw InvalidPathError - let those propagate
    const realPath = this.resolve(path);
    try {
      await fs.access(realPath);
      return true;
    } catch (error) {
      // Only return false for "not found" errors, rethrow others
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
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
    // Validate permissions FIRST - cannot upgrade readonly to read-write
    if (restriction.readonly === false && this.config.readonly) {
      throw new SandboxError(
        'PERMISSION_ESCALATION',
        'Cannot upgrade read-only sandbox to read-write',
        restriction.restrict || '/'
      );
    }

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
      // No path restriction - clone all mounts (don't mutate originals!)
      for (const mount of this.config.mounts) {
        newMounts.push({ ...mount });
      }
    }

    // Apply readonly if requested (can only make more restrictive)
    if (restriction.readonly) {
      newReadonly = true;
      // Also make all mounts readonly (safe - we cloned them above)
      for (const mount of newMounts) {
        mount.readonly = true;
      }
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
      // Normalize target: remove trailing slashes (except for root "/")
      let normalizedTarget = mount.target;
      while (normalizedTarget.length > 1 && normalizedTarget.endsWith('/')) {
        normalizedTarget = normalizedTarget.slice(0, -1);
      }
      resolvedMounts.push({
        source: nodePath.resolve(mount.source),
        target: normalizedTarget,
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
