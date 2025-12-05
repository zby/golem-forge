/**
 * Memory Backend
 *
 * In-memory implementation for testing.
 */

import { Zone, BackendConfig, BackendFileStat } from '../types.js';
import { SandboxBackend } from '../interface.js';
import { NotFoundError } from '../errors.js';

/**
 * In-memory file entry.
 */
interface MemoryFile {
  content: string | Uint8Array;
  createdAt: Date;
  modifiedAt: Date;
}

/**
 * Memory-based sandbox backend for testing.
 */
export class MemoryBackend implements SandboxBackend {
  private files: Map<string, MemoryFile> = new Map();
  private directories: Set<string> = new Set(['/']);
  private config: BackendConfig | null = null;

  async initialize(config: BackendConfig): Promise<void> {
    this.config = config;
    // Create standard directory structure for 2 zones
    this.directories.add('/cache');
    this.directories.add('/workspace');
  }

  async dispose(): Promise<void> {
    // Nothing to clean up
  }

  async readFile(realPath: string): Promise<string> {
    const file = this.files.get(realPath);
    if (!file) {
      throw new NotFoundError(realPath);
    }
    if (file.content instanceof Uint8Array) {
      return new TextDecoder().decode(file.content);
    }
    return file.content;
  }

  async readFileBinary(realPath: string): Promise<Uint8Array> {
    const file = this.files.get(realPath);
    if (!file) {
      throw new NotFoundError(realPath);
    }
    if (file.content instanceof Uint8Array) {
      return file.content;
    }
    return new TextEncoder().encode(file.content);
  }

  async writeFile(realPath: string, content: string): Promise<void> {
    const now = new Date();
    const existing = this.files.get(realPath);
    this.files.set(realPath, {
      content,
      createdAt: existing?.createdAt || now,
      modifiedAt: now,
    });
    // Ensure parent directory exists
    this.ensureParentDir(realPath);
  }

  async writeFileBinary(realPath: string, content: Uint8Array): Promise<void> {
    const now = new Date();
    const existing = this.files.get(realPath);
    this.files.set(realPath, {
      content,
      createdAt: existing?.createdAt || now,
      modifiedAt: now,
    });
    // Ensure parent directory exists
    this.ensureParentDir(realPath);
  }

  async deleteFile(realPath: string): Promise<void> {
    if (!this.files.has(realPath)) {
      throw new NotFoundError(realPath);
    }
    this.files.delete(realPath);
  }

  async exists(realPath: string): Promise<boolean> {
    return this.files.has(realPath) || this.directories.has(realPath);
  }

  async listDir(realPath: string): Promise<string[]> {
    const normalizedPath = realPath.endsWith('/') ? realPath.slice(0, -1) : realPath;

    if (!this.directories.has(normalizedPath) && !this.files.has(normalizedPath)) {
      throw new NotFoundError(realPath);
    }

    const entries = new Set<string>();

    // Find files in this directory
    for (const filePath of this.files.keys()) {
      if (filePath.startsWith(normalizedPath + '/')) {
        const relativePath = filePath.slice(normalizedPath.length + 1);
        const firstSegment = relativePath.split('/')[0];
        entries.add(firstSegment);
      }
    }

    // Find subdirectories
    for (const dirPath of this.directories) {
      if (dirPath.startsWith(normalizedPath + '/')) {
        const relativePath = dirPath.slice(normalizedPath.length + 1);
        const firstSegment = relativePath.split('/')[0];
        if (firstSegment) {
          entries.add(firstSegment);
        }
      }
    }

    return Array.from(entries).sort();
  }

  async stat(realPath: string): Promise<BackendFileStat> {
    const file = this.files.get(realPath);
    if (file) {
      return {
        size: file.content.length,
        createdAt: file.createdAt,
        modifiedAt: file.modifiedAt,
        isDirectory: false,
      };
    }

    if (this.directories.has(realPath)) {
      const now = new Date();
      return {
        size: 0,
        createdAt: now,
        modifiedAt: now,
        isDirectory: true,
      };
    }

    throw new NotFoundError(realPath);
  }

  async mkdir(realPath: string): Promise<void> {
    // Create all parent directories
    const parts = realPath.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current += '/' + part;
      this.directories.add(current);
    }
  }

  mapVirtualToReal(virtualPath: string, zone: Zone): string {
    // Remove leading slash and zone prefix
    const normalized = virtualPath.startsWith('/') ? virtualPath.slice(1) : virtualPath;
    const segments = normalized.split('/');
    const relativePath = segments.slice(1).join('/'); // Remove zone segment

    switch (zone) {
      case Zone.CACHE:
        return `/cache/${relativePath}`;
      case Zone.WORKSPACE:
        return `/workspace/${relativePath}`;
      default:
        throw new Error(`Unknown zone: ${zone}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────

  private ensureParentDir(realPath: string): void {
    const parts = realPath.split('/');
    parts.pop();
    let current = '';
    for (const part of parts.filter(Boolean)) {
      current += '/' + part;
      this.directories.add(current);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Test Helpers
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Get all files (for test inspection).
   */
  getFiles(): Map<string, string | Uint8Array> {
    const result = new Map<string, string | Uint8Array>();
    for (const [path, file] of this.files) {
      result.set(path, file.content);
    }
    return result;
  }

  /**
   * Get all directories (for test inspection).
   */
  getDirectories(): Set<string> {
    return new Set(this.directories);
  }

  /**
   * Reset all state.
   */
  reset(): void {
    this.files.clear();
    this.directories.clear();
    this.directories.add('/');
    if (this.config) {
      this.initialize(this.config);
    }
  }

  /**
   * Seed a file directly (for test setup).
   */
  seedFile(realPath: string, content: string | Uint8Array): void {
    const now = new Date();
    this.files.set(realPath, {
      content,
      createdAt: now,
      modifiedAt: now,
    });
    this.ensureParentDir(realPath);
  }
}
