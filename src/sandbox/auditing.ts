/**
 * Auditing Sandbox Decorator
 *
 * Wraps a Sandbox and adds audit logging to all operations.
 * Uses the decorator pattern for separation of concerns.
 */

import {
  Zone,
  TrustLevel,
  Operation,
  Session,
  SecurityContext,
  PermissionCheck,
  FileStat,
  StageRequest,
  StagedCommit,
} from './types.js';
import { Sandbox, AuditLog } from './interface.js';

/**
 * Decorator that adds audit logging to any Sandbox.
 */
export class AuditingSandbox implements Sandbox {
  constructor(
    private inner: Sandbox,
    private auditLog: AuditLog
  ) {}

  // ─────────────────────────────────────────────────────────────────────
  // Core File Operations (with audit logging)
  // ─────────────────────────────────────────────────────────────────────

  async read(path: string): Promise<string> {
    const session = this.inner.getSession();
    const zone = this.inner.getZone(path);
    const check = this.inner.checkPermission('read', path);

    if (!check.allowed) {
      await this.auditLog.log({
        operation: 'security_violation',
        path,
        zone,
        sessionId: session.id,
        trustLevel: session.trustLevel,
        allowed: false,
        reason: check.reason,
      });
    } else {
      await this.auditLog.log({
        operation: 'read',
        path,
        zone,
        sessionId: session.id,
        trustLevel: session.trustLevel,
        allowed: true,
      });
    }

    return this.inner.read(path);
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const session = this.inner.getSession();
    const zone = this.inner.getZone(path);
    const check = this.inner.checkPermission('read', path);

    if (!check.allowed) {
      await this.auditLog.log({
        operation: 'security_violation',
        path,
        zone,
        sessionId: session.id,
        trustLevel: session.trustLevel,
        allowed: false,
        reason: check.reason,
      });
    } else {
      await this.auditLog.log({
        operation: 'read',
        path,
        zone,
        sessionId: session.id,
        trustLevel: session.trustLevel,
        allowed: true,
        metadata: { binary: true },
      });
    }

    return this.inner.readBinary(path);
  }

  async write(path: string, content: string): Promise<void> {
    const session = this.inner.getSession();
    const zone = this.inner.getZone(path);
    const check = this.inner.checkPermission('write', path);

    if (!check.allowed) {
      await this.auditLog.log({
        operation: 'security_violation',
        path,
        zone,
        sessionId: session.id,
        trustLevel: session.trustLevel,
        allowed: false,
        reason: check.reason,
      });
    } else {
      await this.auditLog.log({
        operation: 'write',
        path,
        zone,
        sessionId: session.id,
        trustLevel: session.trustLevel,
        allowed: true,
        metadata: { contentSize: content.length },
      });
    }

    return this.inner.write(path, content);
  }

  async writeBinary(path: string, content: Uint8Array): Promise<void> {
    const session = this.inner.getSession();
    const zone = this.inner.getZone(path);
    const check = this.inner.checkPermission('write', path);

    if (!check.allowed) {
      await this.auditLog.log({
        operation: 'security_violation',
        path,
        zone,
        sessionId: session.id,
        trustLevel: session.trustLevel,
        allowed: false,
        reason: check.reason,
      });
    } else {
      await this.auditLog.log({
        operation: 'write',
        path,
        zone,
        sessionId: session.id,
        trustLevel: session.trustLevel,
        allowed: true,
        metadata: { contentSize: content.length, binary: true },
      });
    }

    return this.inner.writeBinary(path, content);
  }

  async delete(path: string): Promise<void> {
    const session = this.inner.getSession();
    const zone = this.inner.getZone(path);
    const check = this.inner.checkPermission('delete', path);

    if (!check.allowed) {
      await this.auditLog.log({
        operation: 'security_violation',
        path,
        zone,
        sessionId: session.id,
        trustLevel: session.trustLevel,
        allowed: false,
        reason: check.reason,
      });
    } else {
      await this.auditLog.log({
        operation: 'delete',
        path,
        zone,
        sessionId: session.id,
        trustLevel: session.trustLevel,
        allowed: true,
      });
    }

    return this.inner.delete(path);
  }

  async exists(path: string): Promise<boolean> {
    // exists() is not logged - it's a non-mutating check
    return this.inner.exists(path);
  }

  async list(path: string): Promise<string[]> {
    const session = this.inner.getSession();
    const zone = this.inner.getZone(path);
    const check = this.inner.checkPermission('list', path);

    if (!check.allowed) {
      await this.auditLog.log({
        operation: 'security_violation',
        path,
        zone,
        sessionId: session.id,
        trustLevel: session.trustLevel,
        allowed: false,
        reason: check.reason,
      });
    } else {
      await this.auditLog.log({
        operation: 'list',
        path,
        zone,
        sessionId: session.id,
        trustLevel: session.trustLevel,
        allowed: true,
      });
    }

    return this.inner.list(path);
  }

  async stat(path: string): Promise<FileStat> {
    // stat() is not logged - it's a non-mutating check
    return this.inner.stat(path);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Path Operations (passthrough, no logging needed)
  // ─────────────────────────────────────────────────────────────────────

  resolve(...segments: string[]): string {
    return this.inner.resolve(...segments);
  }

  getZone(path: string): Zone {
    return this.inner.getZone(path);
  }

  isValidPath(path: string): boolean {
    return this.inner.isValidPath(path);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Session Management (passthrough)
  // ─────────────────────────────────────────────────────────────────────

  getSession(): Session {
    return this.inner.getSession();
  }

  getSessionPath(): string {
    return this.inner.getSessionPath();
  }

  async createSessionDir(name: string): Promise<string> {
    return this.inner.createSessionDir(name);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Staging Operations (with audit logging)
  // ─────────────────────────────────────────────────────────────────────

  async stage(files: StageRequest[], message: string): Promise<string> {
    const session = this.inner.getSession();

    const commitId = await this.inner.stage(files, message);

    await this.auditLog.log({
      operation: 'stage',
      sessionId: session.id,
      trustLevel: session.trustLevel,
      allowed: true,
      metadata: {
        commitId,
        fileCount: files.length,
        message,
      },
    });

    return commitId;
  }

  async getStagedCommits(): Promise<StagedCommit[]> {
    return this.inner.getStagedCommits();
  }

  async getStagedCommit(commitId: string): Promise<StagedCommit> {
    return this.inner.getStagedCommit(commitId);
  }

  async discardStaged(commitId: string): Promise<void> {
    return this.inner.discardStaged(commitId);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Security (with violation logging)
  // ─────────────────────────────────────────────────────────────────────

  getSecurityContext(): SecurityContext {
    return this.inner.getSecurityContext();
  }

  checkPermission(operation: Operation, path: string): PermissionCheck {
    return this.inner.checkPermission(operation, path);
  }

  async assertPermission(operation: Operation, path: string): Promise<void> {
    const check = this.inner.checkPermission(operation, path);

    if (!check.allowed) {
      const session = this.inner.getSession();
      await this.auditLog.log({
        operation: 'security_violation',
        path,
        zone: check.zone,
        sessionId: session.id,
        trustLevel: session.trustLevel,
        allowed: false,
        reason: check.reason,
      });
    }

    return this.inner.assertPermission(operation, path);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Accessor
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Get the underlying sandbox (for testing).
   */
  getInner(): Sandbox {
    return this.inner;
  }

  /**
   * Get the audit log (for testing).
   */
  getAuditLog(): AuditLog {
    return this.auditLog;
  }
}
