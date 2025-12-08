/**
 * OPFS Sandbox Implementation
 *
 * Browser-native MountSandbox implementation using Origin Private File System.
 * Implements the same interface as CLI's MountSandboxImpl but backed by OPFS.
 *
 * OPFS provides a sandboxed filesystem that:
 * - Is origin-isolated (only this extension can access)
 * - Persists across sessions
 * - Has better performance than localStorage/IndexedDB for file operations
 * - Supports the FileSystemAccess API
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types (duplicated from CLI to avoid Node.js dependencies)
// ─────────────────────────────────────────────────────────────────────────────

export interface FileStat {
  path: string;
  size: number;
  createdAt: Date;
  modifiedAt: Date;
  isDirectory: boolean;
}

export interface FileOperations {
  read(path: string): Promise<string>;
  readBinary(path: string): Promise<Uint8Array>;
  write(path: string, content: string): Promise<void>;
  writeBinary(path: string, content: Uint8Array): Promise<void>;
  delete(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  list(path: string): Promise<string[]>;
  stat(path: string): Promise<FileStat>;
  resolve(path: string): string;
  isValidPath(path: string): boolean;
}

export interface Mount {
  source: string;
  target: string;
  readonly?: boolean;
}

export interface MountSandboxConfig {
  root: string;
  readonly?: boolean;
  mounts?: Mount[];
}

export interface SubWorkerRestriction {
  restrict?: string;
  readonly?: boolean;
}

export interface ResolvedMount {
  source: string;
  target: string;
  readonly: boolean;
}

export interface ResolvedMountConfig {
  root: string;
  readonly: boolean;
  mounts: ResolvedMount[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Errors
// ─────────────────────────────────────────────────────────────────────────────

export class SandboxError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly path?: string
  ) {
    super(message);
    this.name = 'SandboxError';
  }

  toLLMMessage(): string {
    return this.message;
  }
}

export class NotFoundError extends SandboxError {
  constructor(path: string) {
    super('NOT_FOUND', `File or directory not found: ${path}`, path);
    this.name = 'NotFoundError';
  }

  toLLMMessage(): string {
    return `File not found: ${this.path}. Please check the path and try again.`;
  }
}

export class InvalidPathError extends SandboxError {
  constructor(message: string, path?: string) {
    super('INVALID_PATH', message, path);
    this.name = 'InvalidPathError';
  }

  toLLMMessage(): string {
    return `Invalid path${this.path ? ` "${this.path}"` : ''}: ${this.message}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MountSandbox Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface MountSandbox extends FileOperations {
  canWrite(path: string): boolean;
  restrict(config: SubWorkerRestriction): MountSandbox;
  getConfig(): ResolvedMountConfig;
}

// ─────────────────────────────────────────────────────────────────────────────
// OPFS Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * OPFS-backed MountSandbox implementation.
 *
 * Uses the Origin Private File System API for browser-native file storage.
 * All paths are virtual and mapped to OPFS directories.
 */
export class OPFSSandbox implements MountSandbox {
  private config: ResolvedMountConfig;
  private opfsRoot: FileSystemDirectoryHandle | null = null;

  constructor(config: ResolvedMountConfig) {
    this.config = config;
  }

  /**
   * Initialize the OPFS root handle.
   * Must be called before using file operations.
   */
  async initialize(): Promise<void> {
    this.opfsRoot = await navigator.storage.getDirectory();
  }

  /**
   * Get OPFS root, ensuring it's initialized.
   */
  private async getOPFSRoot(): Promise<FileSystemDirectoryHandle> {
    if (!this.opfsRoot) {
      await this.initialize();
    }
    return this.opfsRoot!;
  }

  /**
   * Get a directory handle, creating it if needed.
   */
  private async getDirectoryHandle(
    path: string,
    create = false
  ): Promise<FileSystemDirectoryHandle> {
    const root = await this.getOPFSRoot();
    const segments = path.split('/').filter(Boolean);

    let current = root;
    for (const segment of segments) {
      current = await current.getDirectoryHandle(segment, { create });
    }
    return current;
  }

  /**
   * Get a file handle.
   */
  private async getFileHandle(
    path: string,
    create = false
  ): Promise<FileSystemFileHandle> {
    const segments = path.split('/').filter(Boolean);
    const fileName = segments.pop();
    if (!fileName) {
      throw new InvalidPathError('Empty file path', path);
    }

    const dirPath = segments.join('/');
    const dir = await this.getDirectoryHandle(dirPath, create);
    return await dir.getFileHandle(fileName, { create });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // File Operations
  // ─────────────────────────────────────────────────────────────────────────

  async read(path: string): Promise<string> {
    const realPath = this.resolve(path);
    try {
      const handle = await this.getFileHandle(realPath);
      const file = await handle.getFile();
      return await file.text();
    } catch (error) {
      if ((error as DOMException).name === 'NotFoundError') {
        throw new NotFoundError(path);
      }
      throw error;
    }
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const realPath = this.resolve(path);
    try {
      const handle = await this.getFileHandle(realPath);
      const file = await handle.getFile();
      const buffer = await file.arrayBuffer();
      return new Uint8Array(buffer);
    } catch (error) {
      if ((error as DOMException).name === 'NotFoundError') {
        throw new NotFoundError(path);
      }
      throw error;
    }
  }

  async write(path: string, content: string): Promise<void> {
    this.checkWritable(path);
    const realPath = this.resolve(path);

    // Ensure parent directories exist
    const segments = realPath.split('/').filter(Boolean);
    segments.pop(); // Remove filename
    if (segments.length > 0) {
      await this.getDirectoryHandle(segments.join('/'), true);
    }

    const handle = await this.getFileHandle(realPath, true);
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  async writeBinary(path: string, content: Uint8Array): Promise<void> {
    this.checkWritable(path);
    const realPath = this.resolve(path);

    // Ensure parent directories exist
    const segments = realPath.split('/').filter(Boolean);
    segments.pop(); // Remove filename
    if (segments.length > 0) {
      await this.getDirectoryHandle(segments.join('/'), true);
    }

    const handle = await this.getFileHandle(realPath, true);
    const writable = await handle.createWritable();
    // Create a new ArrayBuffer copy to avoid SharedArrayBuffer issues
    const buffer = new ArrayBuffer(content.byteLength);
    new Uint8Array(buffer).set(content);
    await writable.write(buffer);
    await writable.close();
  }

  async delete(path: string): Promise<void> {
    this.checkWritable(path);
    const realPath = this.resolve(path);

    try {
      const segments = realPath.split('/').filter(Boolean);
      const fileName = segments.pop();
      if (!fileName) {
        throw new InvalidPathError('Empty file path', path);
      }

      const dirPath = segments.join('/');
      const dir = await this.getDirectoryHandle(dirPath);
      await dir.removeEntry(fileName);
    } catch (error) {
      if ((error as DOMException).name === 'NotFoundError') {
        throw new NotFoundError(path);
      }
      throw error;
    }
  }

  async exists(path: string): Promise<boolean> {
    const realPath = this.resolve(path);
    try {
      // Try as file first
      await this.getFileHandle(realPath);
      return true;
    } catch {
      try {
        // Try as directory
        await this.getDirectoryHandle(realPath);
        return true;
      } catch {
        return false;
      }
    }
  }

  async list(path: string): Promise<string[]> {
    const realPath = this.resolve(path);
    try {
      const dir = await this.getDirectoryHandle(realPath);
      const entries: string[] = [];

      // Use keys() iterator which is more widely supported
      // @ts-expect-error - TypeScript doesn't know about async iterator on FileSystemDirectoryHandle
      for await (const key of dir.keys()) {
        entries.push(key);
      }

      return entries.sort();
    } catch (error) {
      if ((error as DOMException).name === 'NotFoundError') {
        throw new NotFoundError(path);
      }
      throw error;
    }
  }

  async stat(path: string): Promise<FileStat> {
    const realPath = this.resolve(path);

    // Try as file first
    try {
      const handle = await this.getFileHandle(realPath);
      const file = await handle.getFile();
      return {
        path,
        size: file.size,
        createdAt: new Date(file.lastModified), // OPFS doesn't have creation time
        modifiedAt: new Date(file.lastModified),
        isDirectory: false,
      };
    } catch {
      // Try as directory
      try {
        await this.getDirectoryHandle(realPath);
        return {
          path,
          size: 0,
          createdAt: new Date(),
          modifiedAt: new Date(),
          isDirectory: true,
        };
      } catch (error) {
        if ((error as DOMException).name === 'NotFoundError') {
          throw new NotFoundError(path);
        }
        throw error;
      }
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
      const relativePath = normalized.slice(mount.target.length) || '/';
      const cleanRelative = relativePath.startsWith('/')
        ? relativePath.slice(1)
        : relativePath;
      realPath = mount.source + (cleanRelative ? '/' + cleanRelative : '');
    } else {
      const cleanPath = normalized.startsWith('/') ? normalized.slice(1) : normalized;
      realPath = this.config.root + (cleanPath ? '/' + cleanPath : '');
    }

    // Normalize the real path (remove double slashes)
    return realPath.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  }

  isValidPath(path: string): boolean {
    try {
      this.normalizePath(path);
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
    // Validate permissions - cannot upgrade readonly to read-write
    if (restriction.readonly === false && this.config.readonly) {
      throw new SandboxError(
        'PERMISSION_ESCALATION',
        'Cannot upgrade read-only sandbox to read-write',
        restriction.restrict || '/'
      );
    }

    let newRoot = this.config.root;
    let newReadonly = this.config.readonly;
    const newMounts: ResolvedMount[] = [];

    if (restriction.restrict) {
      const restrictPath = this.normalizePath(restriction.restrict);
      const matchingMount = this.findMount(restrictPath);

      if (matchingMount && matchingMount.target === restrictPath) {
        newRoot = matchingMount.source;
        newReadonly = matchingMount.readonly || newReadonly;
      } else {
        newRoot = this.resolve(restrictPath);
        if (matchingMount) {
          newReadonly = matchingMount.readonly || newReadonly;
        }
      }

      // Filter mounts to only include those under the restriction
      for (const mount of this.config.mounts) {
        if (mount.target.startsWith(restrictPath + '/') || mount.target === restrictPath) {
          const newTarget = mount.target.slice(restrictPath.length) || '/';
          newMounts.push({
            source: mount.source,
            target: newTarget.startsWith('/') ? newTarget : '/' + newTarget,
            readonly: mount.readonly,
          });
        }
      }
    } else {
      for (const mount of this.config.mounts) {
        newMounts.push({ ...mount });
      }
    }

    if (restriction.readonly) {
      newReadonly = true;
      for (const mount of newMounts) {
        mount.readonly = true;
      }
    }

    const newSandbox = new OPFSSandbox({
      root: newRoot,
      readonly: newReadonly,
      mounts: newMounts,
    });

    // Share the OPFS root handle
    newSandbox.opfsRoot = this.opfsRoot;

    return newSandbox;
  }

  getConfig(): ResolvedMountConfig {
    return { ...this.config, mounts: [...this.config.mounts] };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────────

  private normalizePath(path: string): string {
    if (!path.startsWith('/')) {
      throw new InvalidPathError(
        `Path must be absolute (start with /): ${path}`,
        path
      );
    }

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
// Factory Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create an OPFS-backed sandbox.
 *
 * @example
 * // Project sandbox
 * const sandbox = await createOPFSSandbox({
 *   root: '/projects/my-project'
 * });
 *
 * @example
 * // Read-only access
 * const sandbox = await createOPFSSandbox({
 *   root: '/projects/my-project',
 *   readonly: true
 * });
 */
export async function createOPFSSandbox(
  config: MountSandboxConfig
): Promise<OPFSSandbox> {
  // Process mounts
  const resolvedMounts: ResolvedMount[] = [];
  if (config.mounts) {
    for (const mount of config.mounts) {
      let normalizedTarget = mount.target;
      while (normalizedTarget.length > 1 && normalizedTarget.endsWith('/')) {
        normalizedTarget = normalizedTarget.slice(0, -1);
      }
      resolvedMounts.push({
        source: mount.source,
        target: normalizedTarget,
        readonly: mount.readonly ?? false,
      });
    }
  }

  // Sort mounts by target path length (longest first for matching)
  resolvedMounts.sort((a, b) => b.target.length - a.target.length);

  const resolvedConfig: ResolvedMountConfig = {
    root: config.root,
    readonly: config.readonly ?? false,
    mounts: resolvedMounts,
  };

  const sandbox = new OPFSSandbox(resolvedConfig);
  await sandbox.initialize();

  // Ensure root directory exists
  const segments = config.root.split('/').filter(Boolean);
  if (segments.length > 0) {
    const root = await navigator.storage.getDirectory();
    let current = root;
    for (const segment of segments) {
      current = await current.getDirectoryHandle(segment, { create: true });
    }
  }

  return sandbox;
}

/**
 * Create a project-specific sandbox.
 *
 * @param projectId - The project ID
 * @param readonly - Whether the sandbox is read-only
 */
export async function createProjectSandbox(
  projectId: string,
  readonly = false
): Promise<OPFSSandbox> {
  return createOPFSSandbox({
    root: `/projects/${projectId}`,
    readonly,
  });
}

/**
 * Create a session-specific working directory sandbox.
 *
 * @param sessionId - The session ID
 */
export async function createSessionSandbox(
  sessionId: string
): Promise<OPFSSandbox> {
  return createOPFSSandbox({
    root: `/working/${sessionId}`,
  });
}

/**
 * Clean up a session sandbox.
 *
 * @param sessionId - The session ID to clean up
 */
export async function cleanupSessionSandbox(sessionId: string): Promise<void> {
  const root = await navigator.storage.getDirectory();

  try {
    const working = await root.getDirectoryHandle('working');
    await working.removeEntry(sessionId, { recursive: true });
  } catch {
    // Ignore if doesn't exist
  }
}

/**
 * Clean up a project sandbox and all its files.
 *
 * @param projectId - The project ID to clean up
 */
export async function cleanupProjectSandbox(projectId: string): Promise<void> {
  const root = await navigator.storage.getDirectory();

  try {
    const projects = await root.getDirectoryHandle('projects');
    await projects.removeEntry(projectId, { recursive: true });
  } catch {
    // Ignore if doesn't exist
  }
}
