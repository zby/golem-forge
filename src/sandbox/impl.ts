/**
 * Sandbox Implementation
 *
 * Core sandbox class that enforces permissions and delegates to backend.
 * Audit logging is handled by AuditingSandbox decorator.
 */

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
import { StagingManager } from './staging.js';
import { AuditingSandbox } from './auditing.js';

/**
 * Generate a UUID that works in both Node.js and browsers.
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Core sandbox implementation without audit logging.
 * Use AuditingSandbox decorator to add logging.
 */
export class SandboxImpl implements Sandbox {
  private backend: SandboxBackend;
  private session: Session;
  private securityContext: SecurityContext;
  private stagingManager: StagingManager;

  constructor(
    backend: SandboxBackend,
    session: Session,
    securityContext: SecurityContext
  ) {
    this.backend = backend;
    this.session = session;
    this.securityContext = securityContext;

    // Create staging manager with permission checker
    this.stagingManager = new StagingManager({
      backend,
      sessionId: session.id,
      checkPermission: async (op, path) => {
        await this.assertPermission(op, path);
      },
    });
  }

  // ─────────────────────────────────────────────────────────────────────
  // Core File Operations
  // ─────────────────────────────────────────────────────────────────────

  async read(path: string): Promise<string> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);

    await this.assertPermission('read', normalizedPath);

    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    return this.backend.readFile(realPath);
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);

    await this.assertPermission('read', normalizedPath);

    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    return this.backend.readFileBinary(realPath);
  }

  async write(path: string, content: string): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);

    await this.assertPermission('write', normalizedPath);

    // Special check: untrusted cannot overwrite in staged zone
    if (
      zone === Zone.STAGED &&
      this.securityContext.trustLevel === 'untrusted'
    ) {
      const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
      if (await this.backend.exists(realPath)) {
        throw new FileExistsError(normalizedPath);
      }
    }

    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    await this.ensureParentDir(realPath);
    await this.backend.writeFile(realPath, content);
  }

  async writeBinary(path: string, content: Uint8Array): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);

    await this.assertPermission('write', normalizedPath);

    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    await this.ensureParentDir(realPath);
    await this.backend.writeFileBinary(realPath, content);
  }

  async delete(path: string): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);

    await this.assertPermission('delete', normalizedPath);

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

    await this.assertPermission('list', normalizedPath);

    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    return this.backend.listDir(realPath);
  }

  async stat(path: string): Promise<FileStat> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);

    await this.assertPermission('read', normalizedPath);

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
      getZoneFromPath(this.normalizePath(path));
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
  // Staging Operations (delegated to StagingManager)
  // ─────────────────────────────────────────────────────────────────────

  async stage(files: StageRequest[], message: string): Promise<string> {
    return this.stagingManager.stage(files, message);
  }

  async getStagedCommits(): Promise<StagedCommit[]> {
    return this.stagingManager.getStagedCommits();
  }

  async getStagedCommit(commitId: string): Promise<StagedCommit> {
    return this.stagingManager.getStagedCommit(commitId);
  }

  async discardStaged(commitId: string): Promise<void> {
    return this.stagingManager.discardStaged(commitId);
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

  async assertPermission(operation: Operation, path: string): Promise<void> {
    const check = this.checkPermission(operation, path);
    if (!check.allowed) {
      throw new PermissionError(check.reason!, path);
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private Helpers
  // ─────────────────────────────────────────────────────────────────────

  private normalizePath(path: string): string {
    const originalPath = path;

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

    const normalized = '/' + resolved.join('/');

    // Validate session isolation
    this.validateSessionAccess(normalized);

    return normalized;
  }

  private validateSessionAccess(path: string): void {
    if (path.startsWith('/session/')) {
      const segments = path.split('/');
      const pathSessionId = segments[2];

      if (pathSessionId && pathSessionId !== this.session.id) {
        throw new PermissionError(
          `Cannot access other session's data (session: ${pathSessionId})`,
          path
        );
      }
    }
  }

  private async ensureParentDir(realPath: string): Promise<void> {
    const parts = realPath.split('/');
    parts.pop();
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
    id: options.id || generateId(),
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
  projectRoot: string;
  trustLevel?: TrustLevel;
  sourceContext?: SourceContext;
  sessionId?: string;
  sandboxDir?: string;
}

/**
 * Create a sandbox for CLI environment with audit logging.
 */
export async function createCLISandbox(options: CreateCLISandboxOptions): Promise<{
  sandbox: Sandbox;
  session: Session;
}> {
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
  const coreSandbox = new SandboxImpl(backend, session, securityContext);

  // Wrap with auditing decorator
  const sandbox = new AuditingSandbox(coreSandbox, auditLog);

  return { sandbox, session };
}

/**
 * Create a test sandbox with memory backend (no audit logging).
 */
export async function createTestSandbox(options: {
  trustLevel?: TrustLevel;
  sessionId?: string;
  workspaceId?: string;
  auditLog?: AuditLog;
}): Promise<{
  sandbox: Sandbox;
  session: Session;
}> {
  const { MemoryBackend, MemoryAuditLog } = await import('./backends/memory.js');

  const trustLevel = options.trustLevel || 'session';

  const session = createSession({
    id: options.sessionId || 'test-session',
    workspaceId: options.workspaceId || 'test-workspace',
    trustLevel,
    sourceContext: {
      type: 'cli',
      userInitiated: true,
    },
  });

  const backend = new MemoryBackend();
  await backend.initialize({
    workspaceId: session.workspaceId,
    sessionId: session.id,
  });

  const securityContext = createSecurityContext(trustLevel, session);
  const coreSandbox = new SandboxImpl(backend, session, securityContext);

  // Optionally wrap with auditing
  const auditLog = options.auditLog || new MemoryAuditLog();
  const sandbox = new AuditingSandbox(coreSandbox, auditLog);

  return { sandbox, session };
}
