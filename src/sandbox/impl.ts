/**
 * Sandbox Implementation
 *
 * Core sandbox class that enforces permissions and delegates to backend.
 */

import { randomUUID } from 'crypto';
import {
  Zone,
  Operation,
  TrustLevel,
  Session,
  SecurityContext,
  PermissionCheck,
  FileStat,
  StageRequest,
  StagedCommit,
  StagedFile,
  SourceContext,
} from './types.js';
import { Sandbox, SandboxBackend, AuditLog } from './interface.js';
import {
  PermissionError,
  NotFoundError,
  InvalidPathError,
  FileExistsError,
} from './errors.js';
import { getPermissionProfile, getZoneFromPath } from './zones.js';

/**
 * Generate a content hash for staged files.
 */
function hashContent(content: string): string {
  // Simple hash for now - could use crypto.subtle in browser
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Core sandbox implementation.
 */
export class SandboxImpl implements Sandbox {
  private backend: SandboxBackend;
  private session: Session;
  private securityContext: SecurityContext;
  private auditLog: AuditLog;
  private stagedCommits: Map<string, StagedCommit> = new Map();

  constructor(
    backend: SandboxBackend,
    session: Session,
    securityContext: SecurityContext,
    auditLog: AuditLog
  ) {
    this.backend = backend;
    this.session = session;
    this.securityContext = securityContext;
    this.auditLog = auditLog;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Core File Operations
  // ─────────────────────────────────────────────────────────────────────

  async read(path: string): Promise<string> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);

    this.assertPermission('read', normalizedPath);

    await this.auditLog.log({
      operation: 'read',
      path: normalizedPath,
      zone,
      sessionId: this.session.id,
      trustLevel: this.securityContext.trustLevel,
      allowed: true,
    });

    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    return this.backend.readFile(realPath);
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);

    this.assertPermission('read', normalizedPath);

    await this.auditLog.log({
      operation: 'read',
      path: normalizedPath,
      zone,
      sessionId: this.session.id,
      trustLevel: this.securityContext.trustLevel,
      allowed: true,
      metadata: { binary: true },
    });

    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    return this.backend.readFileBinary(realPath);
  }

  async write(path: string, content: string): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);

    this.assertPermission('write', normalizedPath);

    // Special check: untrusted cannot overwrite in staged zone
    if (
      zone === Zone.STAGED &&
      this.securityContext.trustLevel === 'untrusted'
    ) {
      const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
      if (await this.backend.exists(realPath)) {
        await this.auditLog.log({
          operation: 'write',
          path: normalizedPath,
          zone,
          sessionId: this.session.id,
          trustLevel: this.securityContext.trustLevel,
          allowed: false,
          reason: 'Untrusted sessions cannot overwrite staged files',
        });
        throw new FileExistsError(normalizedPath);
      }
    }

    await this.auditLog.log({
      operation: 'write',
      path: normalizedPath,
      zone,
      sessionId: this.session.id,
      trustLevel: this.securityContext.trustLevel,
      allowed: true,
      metadata: { contentSize: content.length },
    });

    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    await this.ensureParentDir(realPath);
    await this.backend.writeFile(realPath, content);
  }

  async writeBinary(path: string, content: Uint8Array): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);

    this.assertPermission('write', normalizedPath);

    await this.auditLog.log({
      operation: 'write',
      path: normalizedPath,
      zone,
      sessionId: this.session.id,
      trustLevel: this.securityContext.trustLevel,
      allowed: true,
      metadata: { contentSize: content.length, binary: true },
    });

    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    await this.ensureParentDir(realPath);
    await this.backend.writeFileBinary(realPath, content);
  }

  async delete(path: string): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);

    this.assertPermission('delete', normalizedPath);

    await this.auditLog.log({
      operation: 'delete',
      path: normalizedPath,
      zone,
      sessionId: this.session.id,
      trustLevel: this.securityContext.trustLevel,
      allowed: true,
    });

    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    await this.backend.deleteFile(realPath);
  }

  async exists(path: string): Promise<boolean> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);

    // exists() uses read permission
    const check = this.checkPermission('read', normalizedPath);
    if (!check.allowed) {
      return false; // Don't reveal existence of files outside accessible zones
    }

    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    return this.backend.exists(realPath);
  }

  async list(path: string): Promise<string[]> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);

    this.assertPermission('list', normalizedPath);

    await this.auditLog.log({
      operation: 'list',
      path: normalizedPath,
      zone,
      sessionId: this.session.id,
      trustLevel: this.securityContext.trustLevel,
      allowed: true,
    });

    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    return this.backend.listDir(realPath);
  }

  async stat(path: string): Promise<FileStat> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);

    this.assertPermission('read', normalizedPath);

    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    const backendStat = await this.backend.stat(realPath);

    return {
      path: normalizedPath,
      zone,
      ...backendStat,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Path Operations
  // ─────────────────────────────────────────────────────────────────────

  resolve(...segments: string[]): string {
    const joined = segments.join('/');
    if (joined.startsWith('/')) {
      return this.normalizePath(joined);
    }
    // Relative path - resolve within session working directory
    return this.normalizePath(`/session/${this.session.id}/working/${joined}`);
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
      this.normalizePath(path);
      this.getZone(path);
      return true;
    } catch {
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Session Management
  // ─────────────────────────────────────────────────────────────────────

  getSession(): Session {
    return { ...this.session };
  }

  getSessionPath(): string {
    return `/session/${this.session.id}`;
  }

  async createSessionDir(name: string): Promise<string> {
    const dirPath = `/session/${this.session.id}/${name}`;
    const realPath = this.backend.mapVirtualToReal(dirPath, Zone.SESSION);
    await this.backend.mkdir(realPath);
    return dirPath;
  }

  // ─────────────────────────────────────────────────────────────────────
  // Staging Operations
  // ─────────────────────────────────────────────────────────────────────

  async stage(files: StageRequest[], message: string): Promise<string> {
    const commitId = randomUUID();

    await this.auditLog.log({
      operation: 'stage',
      sessionId: this.session.id,
      trustLevel: this.securityContext.trustLevel,
      allowed: true,
      metadata: {
        commitId,
        fileCount: files.length,
        message,
      },
    });

    const stagedFiles: StagedFile[] = [];

    for (const file of files) {
      const stagePath = `/staged/${commitId}/${file.repoPath}`;
      const zone = Zone.STAGED;

      // Check write permission to staged zone
      this.assertPermission('write', stagePath);

      // Write file to staging area
      const realPath = this.backend.mapVirtualToReal(stagePath, zone);
      await this.ensureParentDir(realPath);
      await this.backend.writeFile(realPath, file.content);

      stagedFiles.push({
        repoPath: file.repoPath,
        operation: 'create', // TODO: detect update vs create
        size: file.content.length,
        hash: hashContent(file.content),
      });
    }

    const stagedCommit: StagedCommit = {
      id: commitId,
      sessionId: this.session.id,
      createdAt: new Date(),
      message,
      files: stagedFiles,
      status: 'pending',
    };

    this.stagedCommits.set(commitId, stagedCommit);

    return commitId;
  }

  async getStagedCommits(): Promise<StagedCommit[]> {
    return Array.from(this.stagedCommits.values());
  }

  async getStagedCommit(commitId: string): Promise<StagedCommit> {
    const commit = this.stagedCommits.get(commitId);
    if (!commit) {
      throw new NotFoundError(`/staged/${commitId}`);
    }
    return commit;
  }

  async discardStaged(commitId: string): Promise<void> {
    const commit = this.stagedCommits.get(commitId);
    if (!commit) {
      throw new NotFoundError(`/staged/${commitId}`);
    }

    // Delete all staged files
    for (const file of commit.files) {
      const stagePath = `/staged/${commitId}/${file.repoPath}`;
      const realPath = this.backend.mapVirtualToReal(stagePath, Zone.STAGED);
      if (await this.backend.exists(realPath)) {
        await this.backend.deleteFile(realPath);
      }
    }

    this.stagedCommits.delete(commitId);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Security
  // ─────────────────────────────────────────────────────────────────────

  getSecurityContext(): SecurityContext {
    return { ...this.securityContext };
  }

  checkPermission(operation: Operation, path: string): PermissionCheck {
    const zone = this.getZone(path);
    const zoneConfig = this.securityContext.permissions[zone];

    let allowed: boolean;
    switch (operation) {
      case 'read':
        allowed = zoneConfig.readable;
        break;
      case 'write':
        allowed = zoneConfig.writable;
        break;
      case 'delete':
        allowed = zoneConfig.deletable;
        break;
      case 'list':
        allowed = zoneConfig.listable;
        break;
    }

    return {
      allowed,
      reason: allowed ? undefined : `${operation} not permitted in ${zone} zone`,
      zone,
      trustLevel: this.securityContext.trustLevel,
    };
  }

  assertPermission(operation: Operation, path: string): void {
    const check = this.checkPermission(operation, path);
    if (!check.allowed) {
      this.auditLog.log({
        operation: 'security_violation',
        path,
        zone: check.zone,
        sessionId: this.session.id,
        trustLevel: this.securityContext.trustLevel,
        allowed: false,
        reason: check.reason,
      });
      throw new PermissionError(check.reason!, path);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────

  private normalizePath(path: string): string {
    // Handle relative paths within session
    if (!path.startsWith('/')) {
      path = `/session/${this.session.id}/working/${path}`;
    }

    // Resolve . and ..
    const segments = path.split('/');
    const resolved: string[] = [];

    for (const segment of segments) {
      if (segment === '' || segment === '.') continue;
      if (segment === '..') {
        resolved.pop();
      } else {
        resolved.push(segment);
      }
    }

    const normalized = '/' + resolved.join('/');

    // Security: ensure no escape from virtual root
    if (!normalized.startsWith('/')) {
      throw new InvalidPathError('Path escape attempt detected', path);
    }

    return normalized;
  }

  private async ensureParentDir(realPath: string): Promise<void> {
    const parts = realPath.split('/');
    parts.pop(); // Remove filename
    const parentDir = parts.join('/');
    if (parentDir && !(await this.backend.exists(parentDir))) {
      await this.backend.mkdir(parentDir);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Factory Functions
// ─────────────────────────────────────────────────────────────────────────

/**
 * Create a security context from trust level and session.
 */
export function createSecurityContext(
  trustLevel: TrustLevel,
  session: Session
): SecurityContext {
  return {
    trustLevel,
    sessionId: session.id,
    origin: session.sourceContext.origin || null,
    permissions: getPermissionProfile(trustLevel),
  };
}

/**
 * Create a new session.
 */
export function createSession(options: {
  id?: string;
  workspaceId: string;
  trustLevel: TrustLevel;
  sourceContext: SourceContext;
}): Session {
  return {
    id: options.id || randomUUID(),
    workspaceId: options.workspaceId,
    createdAt: new Date(),
    trustLevel: options.trustLevel,
    sourceContext: options.sourceContext,
  };
}

/**
 * Options for creating a CLI sandbox.
 */
export interface CreateCLISandboxOptions {
  /** Project root directory (required) */
  projectRoot: string;
  /** Trust level (defaults to 'session') */
  trustLevel?: TrustLevel;
  /** Source context (defaults to CLI user-initiated) */
  sourceContext?: SourceContext;
  /** Custom session ID (auto-generated if not provided) */
  sessionId?: string;
  /** Custom sandbox directory (defaults to .sandbox in project root) */
  sandboxDir?: string;
}

/**
 * Create a sandbox for CLI environment.
 *
 * This is a convenience function that wires up all the components
 * needed for a CLI sandbox.
 */
export async function createCLISandbox(options: CreateCLISandboxOptions): Promise<{
  sandbox: Sandbox;
  session: Session;
}> {
  // Dynamic import to avoid circular dependency and keep CLI backend optional
  const { CLIBackend, FileAuditLog } = await import('./backends/cli.js');

  const trustLevel = options.trustLevel || 'session';
  const sourceContext = options.sourceContext || {
    type: 'cli' as const,
    userInitiated: true,
  };

  const session = createSession({
    id: options.sessionId,
    workspaceId: 'cli',
    trustLevel,
    sourceContext,
  });

  const backend = new CLIBackend();
  await backend.initialize({
    workspaceId: 'cli',
    sessionId: session.id,
    projectRoot: options.projectRoot,
    sandboxDir: options.sandboxDir,
  });

  const sandboxDir = options.sandboxDir || `${options.projectRoot}/.sandbox`;
  const auditLog = new FileAuditLog(`${sandboxDir}/audit.log`);

  const securityContext = createSecurityContext(trustLevel, session);
  const sandbox = new SandboxImpl(backend, session, securityContext, auditLog);

  return { sandbox, session };
}
