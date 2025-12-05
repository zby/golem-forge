/**
 * CLI Backend
 *
 * Node.js filesystem implementation of SandboxBackend.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { Zone, BackendConfig, BackendFileStat } from '../types.js';
import { SandboxBackend, AuditLog, AuditEntry, AuditFilter } from '../interface.js';
import { NotFoundError } from '../errors.js';

/**
 * CLI backend using Node.js filesystem.
 */
export class CLIBackend implements SandboxBackend {
  private projectRoot: string = '';
  private sandboxDir: string = '';
  private sessionId: string = '';
  private workersSearchPaths: string[] = [];

  async initialize(config: BackendConfig): Promise<void> {
    if (!config.projectRoot) {
      throw new Error('CLIBackend requires projectRoot in config');
    }

    this.projectRoot = config.projectRoot;
    this.sandboxDir = config.sandboxDir || path.join(this.projectRoot, '.sandbox');
    this.sessionId = config.sessionId;

    // Parse LLM_DO_PATH for worker search paths
    const llmDoPath = process.env.LLM_DO_PATH || '';
    this.workersSearchPaths = llmDoPath
      .split(':')
      .filter(Boolean)
      .concat(path.join(this.projectRoot, '.workers'));

    // Create sandbox directory structure
    await fs.mkdir(path.join(this.sandboxDir, 'sessions', this.sessionId, 'inputs'), { recursive: true });
    await fs.mkdir(path.join(this.sandboxDir, 'sessions', this.sessionId, 'working'), { recursive: true });
    await fs.mkdir(path.join(this.sandboxDir, 'sessions', this.sessionId, 'outputs'), { recursive: true });
    await fs.mkdir(path.join(this.sandboxDir, 'cache'), { recursive: true });
    await fs.mkdir(path.join(this.sandboxDir, 'data'), { recursive: true });
    await fs.mkdir(path.join(this.sandboxDir, 'staged'), { recursive: true });
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
    // Remove leading slash and split
    const segments = virtualPath.slice(1).split('/');
    // Remove zone prefix (first segment)
    const relativePath = segments.slice(1).join('/');

    switch (zone) {
      case Zone.SESSION:
        // /session/{id}/... -> .sandbox/sessions/{id}/...
        return path.join(this.sandboxDir, 'sessions', relativePath);

      case Zone.WORKSPACE:
        // /workspace/cache/... -> .sandbox/cache/...
        // /workspace/data/... -> .sandbox/data/...
        if (virtualPath.startsWith('/workspace/cache/')) {
          const cachePath = relativePath.replace(/^cache\//, '');
          return path.join(this.sandboxDir, 'cache', cachePath);
        }
        if (virtualPath.startsWith('/workspace/data/')) {
          const dataPath = relativePath.replace(/^data\//, '');
          return path.join(this.sandboxDir, 'data', dataPath);
        }
        // Default to data
        return path.join(this.sandboxDir, 'data', relativePath);

      case Zone.REPO:
        // /repo/... -> {projectRoot}/...
        return path.join(this.projectRoot, relativePath);

      case Zone.STAGED:
        // /staged/... -> .sandbox/staged/...
        return path.join(this.sandboxDir, 'staged', relativePath);

      case Zone.WORKERS:
        // /workers/... -> search in LLM_DO_PATH and .workers
        return this.resolveWorkerPath(relativePath);
    }
  }

  mapRealToVirtual(realPath: string): string | null {
    // Normalize paths for comparison
    const normalized = path.normalize(realPath);
    const sandboxNormalized = path.normalize(this.sandboxDir);
    const projectNormalized = path.normalize(this.projectRoot);

    // Check if in sandbox directory
    if (normalized.startsWith(sandboxNormalized)) {
      const relative = normalized.slice(sandboxNormalized.length + 1);

      if (relative.startsWith('sessions/')) {
        return '/session/' + relative.slice('sessions/'.length);
      }
      if (relative.startsWith('cache/')) {
        return '/workspace/cache/' + relative.slice('cache/'.length);
      }
      if (relative.startsWith('data/')) {
        return '/workspace/data/' + relative.slice('data/'.length);
      }
      if (relative.startsWith('staged/')) {
        return '/staged/' + relative.slice('staged/'.length);
      }
    }

    // Check if in project root (repo)
    if (normalized.startsWith(projectNormalized) && !normalized.startsWith(sandboxNormalized)) {
      const relative = normalized.slice(projectNormalized.length + 1);
      return '/repo/' + relative;
    }

    // Check workers paths
    for (const searchPath of this.workersSearchPaths) {
      const searchNormalized = path.normalize(searchPath);
      if (normalized.startsWith(searchNormalized)) {
        const relative = normalized.slice(searchNormalized.length + 1);
        return '/workers/' + relative;
      }
    }

    return null;
  }

  private resolveWorkerPath(relativePath: string): string {
    // Search in order: project .workers, then LLM_DO_PATH entries
    for (const searchPath of this.workersSearchPaths) {
      const candidate = path.join(searchPath, relativePath);
      // Note: We return the path even if it doesn't exist
      // The caller will handle NotFoundError
      try {
        // Check synchronously for simplicity in path mapping
        require('fs').accessSync(candidate);
        return candidate;
      } catch {
        // Continue searching
      }
    }

    // Default to first search path if nothing found
    if (this.workersSearchPaths.length > 0) {
      return path.join(this.workersSearchPaths[0], relativePath);
    }

    // Fallback to project .workers
    return path.join(this.projectRoot, '.workers', relativePath);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Getters for inspection
  // ─────────────────────────────────────────────────────────────────────

  getProjectRoot(): string {
    return this.projectRoot;
  }

  getSandboxDir(): string {
    return this.sandboxDir;
  }

  getSessionId(): string {
    return this.sessionId;
  }
}

/**
 * File-based audit log for CLI.
 */
export class FileAuditLog implements AuditLog {
  private logPath: string;
  private entries: AuditEntry[] = [];
  private loaded: boolean = false;

  constructor(logPath: string) {
    this.logPath = logPath;
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;

    try {
      const content = await fs.readFile(this.logPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      this.entries = lines.map(line => {
        const parsed = JSON.parse(line);
        return {
          ...parsed,
          timestamp: new Date(parsed.timestamp),
        };
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist yet, start with empty entries
      this.entries = [];
    }
    this.loaded = true;
  }

  private async appendToFile(entry: AuditEntry): Promise<void> {
    await fs.mkdir(path.dirname(this.logPath), { recursive: true });
    const line = JSON.stringify(entry) + '\n';
    await fs.appendFile(this.logPath, line, 'utf-8');
  }

  async log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void> {
    const fullEntry: AuditEntry = {
      ...entry,
      id: randomUUID(),
      timestamp: new Date(),
    };

    await this.ensureLoaded();
    this.entries.push(fullEntry);
    await this.appendToFile(fullEntry);
  }

  async getEntries(filter?: AuditFilter): Promise<AuditEntry[]> {
    await this.ensureLoaded();
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
    await this.ensureLoaded();
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
    await this.ensureLoaded();
    const before = this.entries.length;
    this.entries = this.entries.filter(e => e.timestamp >= olderThan);
    const pruned = before - this.entries.length;

    if (pruned > 0) {
      // Rewrite the entire file
      await fs.mkdir(path.dirname(this.logPath), { recursive: true });
      const content = this.entries.map(e => JSON.stringify(e)).join('\n') + '\n';
      await fs.writeFile(this.logPath, content, 'utf-8');
    }

    return pruned;
  }

  // Test helper
  getLogPath(): string {
    return this.logPath;
  }
}
