/**
 * Sandbox Interfaces
 *
 * Core interfaces for the sandbox system.
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
  BackendConfig,
  BackendFileStat,
} from './types.js';

/**
 * Main sandbox interface used by workers and tools.
 * Provides a unified API regardless of backend (CLI, browser, memory).
 */
export interface Sandbox {
  // ─────────────────────────────────────────────────────────────────────
  // Core File Operations
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Read file content from virtual path.
   * @throws PermissionError if zone not readable
   * @throws NotFoundError if file doesn't exist
   */
  read(path: string): Promise<string>;

  /**
   * Read file as binary.
   */
  readBinary(path: string): Promise<Uint8Array>;

  /**
   * Write content to virtual path.
   * @throws PermissionError if zone not writable
   */
  write(path: string, content: string): Promise<void>;

  /**
   * Write binary content.
   */
  writeBinary(path: string, content: Uint8Array): Promise<void>;

  /**
   * Delete file at virtual path.
   * @throws PermissionError if zone not deletable
   */
  delete(path: string): Promise<void>;

  /**
   * Check if path exists.
   */
  exists(path: string): Promise<boolean>;

  /**
   * List directory contents.
   * @throws PermissionError if zone not listable
   */
  list(path: string): Promise<string[]>;

  /**
   * Get file metadata.
   */
  stat(path: string): Promise<FileStat>;

  // ─────────────────────────────────────────────────────────────────────
  // Path Operations
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Resolve relative path within current session.
   */
  resolve(...segments: string[]): string;

  /**
   * Get zone for a virtual path.
   */
  getZone(path: string): Zone;

  /**
   * Check if path is within allowed boundaries.
   */
  isValidPath(path: string): boolean;

  // ─────────────────────────────────────────────────────────────────────
  // Session Management
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Get current session info.
   */
  getSession(): Session;

  /**
   * Get path to session's working directory.
   */
  getSessionPath(): string;

  /**
   * Create a subdirectory in session working area.
   */
  createSessionDir(name: string): Promise<string>;

  // ─────────────────────────────────────────────────────────────────────
  // Staging Operations (for Git sync)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Stage files for commit.
   * @param files - Files to stage
   * @param message - Commit message for this staged commit
   * @returns Staged commit ID
   */
  stage(files: StageRequest[], message: string): Promise<string>;

  /**
   * Get list of staged commits.
   */
  getStagedCommits(): Promise<StagedCommit[]>;

  /**
   * Get specific staged commit.
   */
  getStagedCommit(commitId: string): Promise<StagedCommit>;

  /**
   * Discard a staged commit.
   */
  discardStaged(commitId: string): Promise<void>;

  // ─────────────────────────────────────────────────────────────────────
  // Security
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Get current security context.
   */
  getSecurityContext(): SecurityContext;

  /**
   * Check if operation is permitted.
   */
  checkPermission(operation: Operation, path: string): PermissionCheck;

  /**
   * Assert permission (throws if denied).
   */
  assertPermission(operation: Operation, path: string): Promise<void>;
}

/**
 * Backend implementation interface.
 * CLI and Browser provide different implementations.
 */
export interface SandboxBackend {
  // ─────────────────────────────────────────────────────────────────────
  // Raw File Operations (no permission checking)
  // ─────────────────────────────────────────────────────────────────────

  readFile(realPath: string): Promise<string>;
  readFileBinary(realPath: string): Promise<Uint8Array>;
  writeFile(realPath: string, content: string): Promise<void>;
  writeFileBinary(realPath: string, content: Uint8Array): Promise<void>;
  deleteFile(realPath: string): Promise<void>;
  exists(realPath: string): Promise<boolean>;
  listDir(realPath: string): Promise<string[]>;
  stat(realPath: string): Promise<BackendFileStat>;
  mkdir(realPath: string): Promise<void>;

  // ─────────────────────────────────────────────────────────────────────
  // Path Mapping
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Map a virtual path to real storage path.
   */
  mapVirtualToReal(virtualPath: string, zone: Zone): string;

  /**
   * Map a real storage path back to virtual path.
   * Returns null if path is not within sandbox.
   */
  mapRealToVirtual(realPath: string): string | null;

  // ─────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Initialize the backend.
   */
  initialize(config: BackendConfig): Promise<void>;

  /**
   * Clean up resources.
   */
  dispose(): Promise<void>;
}

/**
 * Audit entry for logging security-relevant events.
 */
export interface AuditEntry {
  /** Unique entry ID */
  id: string;
  /** When the operation occurred */
  timestamp: Date;
  /** Type of operation */
  operation: Operation | 'stage' | 'permission_check' | 'security_violation';
  /** Virtual path involved */
  path?: string;
  /** Zone the path belongs to */
  zone?: Zone;
  /** Session that performed the operation */
  sessionId: string;
  /** Trust level at time of operation */
  trustLevel: TrustLevel;
  /** Whether the operation was allowed */
  allowed: boolean;
  /** Reason if denied */
  reason?: string;
  /** Additional context (e.g., content size for writes) */
  metadata?: Record<string, unknown>;
}

/**
 * Filter for querying audit entries.
 */
export interface AuditFilter {
  sessionId?: string;
  operation?: AuditEntry['operation'];
  zone?: Zone;
  trustLevel?: TrustLevel;
  allowed?: boolean;
  startTime?: Date;
  endTime?: Date;
  limit?: number;
}

/**
 * Audit log interface for recording security-relevant events.
 */
export interface AuditLog {
  /**
   * Log an audit entry.
   */
  log(entry: Omit<AuditEntry, 'id' | 'timestamp'>): Promise<void>;

  /**
   * Query audit entries.
   */
  getEntries(filter?: AuditFilter): Promise<AuditEntry[]>;

  /**
   * Get entries for a specific session.
   */
  getSessionEntries(sessionId: string): Promise<AuditEntry[]>;

  /**
   * Get recent security violations.
   */
  getViolations(limit?: number): Promise<AuditEntry[]>;

  /**
   * Export audit log to JSON.
   */
  export(filter?: AuditFilter): Promise<string>;

  /**
   * Clear old entries (for rotation).
   * @param olderThan - Delete entries older than this date
   */
  prune(olderThan: Date): Promise<number>;
}
