/**
 * Memory Backend
 *
 * In-memory implementation for testing.
 */

import { randomUUID } from 'crypto';
import { Zone, BackendConfig, BackendFileStat } from '../types.js';
import { SandboxBackend, AuditLog, AuditEntry, AuditFilter } from '../interface.js';
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
    // Create standard directory structure
    const dirs = [
      `/sessions/${config.sessionId}`,
      `/sessions/${config.sessionId}/inputs`,
      `/sessions/${config.sessionId}/working`,
      `/sessions/${config.sessionId}/outputs`,
      '/cache',
      '/data',
      '/staged',
      '/repo',
      '/workers',
    ];
    for (const dir of dirs) {
      this.directories.add(dir);
    }
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
  }

  async writeFileBinary(realPath: string, content: Uint8Array): Promise<void> {
    const now = new Date();
    const existing = this.files.get(realPath);
    this.files.set(realPath, {
      content,
      createdAt: existing?.createdAt || now,
      modifiedAt: now,
    });
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
    const relativePath = virtualPath.split('/').slice(2).join('/');

    switch (zone) {
      case Zone.SESSION:
        return `/sessions/${relativePath}`;
      case Zone.WORKSPACE:
        if (virtualPath.startsWith('/workspace/cache')) {
          return `/cache/${relativePath.replace(/^cache\//, '')}`;
        }
        return `/data/${relativePath.replace(/^data\//, '')}`;
      case Zone.REPO:
        return `/repo/${relativePath}`;
      case Zone.STAGED:
        return `/staged/${relativePath}`;
      case Zone.WORKERS:
        return `/workers/${relativePath}`;
    }
  }

  mapRealToVirtual(realPath: string): string | null {
    if (realPath.startsWith('/sessions/')) {
      return '/session/' + realPath.slice('/sessions/'.length);
    }
    if (realPath.startsWith('/cache/')) {
      return '/workspace/cache/' + realPath.slice('/cache/'.length);
    }
    if (realPath.startsWith('/data/')) {
      return '/workspace/data/' + realPath.slice('/data/'.length);
    }
    if (realPath.startsWith('/repo/')) {
      return '/repo/' + realPath.slice('/repo/'.length);
    }
    if (realPath.startsWith('/staged/')) {
      return '/staged/' + realPath.slice('/staged/'.length);
    }
    if (realPath.startsWith('/workers/')) {
      return '/workers/' + realPath.slice('/workers/'.length);
    }
    return null;
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
    // Ensure parent directories exist
    const parts = realPath.split('/');
    parts.pop();
    let current = '';
    for (const part of parts.filter(Boolean)) {
      current += '/' + part;
      this.directories.add(current);
    }
  }
}

/**
 * In-memory audit log for testing.
 */
export class MemoryAuditLog implements AuditLog {
  private entries: AuditEntry[] = [];

  async log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void> {
    this.entries.push({
      ...entry,
      id: randomUUID(),
      timestamp: new Date(),
    });
  }

  async getEntries(filter?: AuditFilter): Promise<AuditEntry[]> {
    let result = [...this.entries];

    if (filter) {
      if (filter.sessionId) {
        result = result.filter(e => e.sessionId === filter.sessionId);
      }
      if (filter.operation) {
        result = result.filter(e => e.operation === filter.operation);
      }
      if (filter.zone) {
        result = result.filter(e => e.zone === filter.zone);
      }
      if (filter.trustLevel) {
        result = result.filter(e => e.trustLevel === filter.trustLevel);
      }
      if (filter.allowed !== undefined) {
        result = result.filter(e => e.allowed === filter.allowed);
      }
      if (filter.startTime) {
        result = result.filter(e => e.timestamp >= filter.startTime!);
      }
      if (filter.endTime) {
        result = result.filter(e => e.timestamp <= filter.endTime!);
      }
      if (filter.limit) {
        result = result.slice(0, filter.limit);
      }
    }

    return result;
  }

  async getSessionEntries(sessionId: string): Promise<AuditEntry[]> {
    return this.getEntries({ sessionId });
  }

  async getViolations(limit?: number): Promise<AuditEntry[]> {
    const violations = this.entries.filter(
      e => e.operation === 'security_violation' || !e.allowed
    );
    return limit ? violations.slice(0, limit) : violations;
  }

  async export(filter?: AuditFilter): Promise<string> {
    const entries = await this.getEntries(filter);
    return JSON.stringify(entries, null, 2);
  }

  async prune(olderThan: Date): Promise<number> {
    const before = this.entries.length;
    this.entries = this.entries.filter(e => e.timestamp >= olderThan);
    return before - this.entries.length;
  }

  // Test helpers
  clear(): void {
    this.entries = [];
  }

  getAll(): AuditEntry[] {
    return [...this.entries];
  }
}
