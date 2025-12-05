# Unified Sandbox Design

## Overview

This document specifies a unified sandboxing system that provides consistent security guarantees across both CLI and browser extension runtimes. The sandbox abstracts storage backends while enforcing the same permission model everywhere.

## Related Documents

- **[User Stories](./user-stories.md)** - Requirements and acceptance criteria this design implements
- **[Browser Extension Architecture](./browser-extension-architecture.md)** - Browser-specific architecture details

## Requirements Traceability

This design addresses the following user stories from [user-stories.md](./user-stories.md):

### Security Stories

| Story | Requirement | Implementation |
|-------|-------------|----------------|
| **2.1** Untrusted Content Warning | Visual indicator of trust level | `SecurityContext.trustLevel` exposed via `sandbox.getSecurityContext()` |
| **2.2** Promote Trust Level | Ability to elevate permissions | Trust levels: `untrusted` → `session` → `workspace` → `full` |
| **2.3** Block Suspicious Operations | Alert on unauthorized access attempts | `PermissionError` thrown with audit logging |
| **2.4** Review Staged Changes | User reviews before push | `staged/` zone with explicit commit flow |
| **6.1** View Audit Log | Record all security-relevant actions | `AuditLog` interface with all operations logged |

### Functional Stories

| Story | Requirement | Implementation |
|-------|-------------|----------------|
| **1.1** Analyze PDF from Web Search | Cache downloaded PDFs | `/workspace/cache/pdfs/` zone |
| **1.2** Batch Analyze Multiple Documents | Session isolation per analysis | `/session/{id}/` per-session directories |
| **1.3** Continue Analysis in VS Code | Git sync for local editing | `stage()` → GitHub → `git pull` locally |
| **3.2** Work Offline | OPFS persistence | Browser backend stores in OPFS |
| **3.4** Multiple Workspaces | Isolated workspace storage | `workspaceId` parameter isolates all paths |
| **4.1** Run Analysis Worker | Filesystem tools for workers | `createFilesystemTools(sandbox)` |
| **4.2** Tool Approval Flow | Permission-based approval | `needsApproval()` checks `checkPermission()` |
| **7.1** Recover from Failed Push | Staged files preserved | `/staged/` persists until committed/discarded |
| **7.3** Session Recovery After Crash | Persist incomplete work | OPFS/filesystem persistence survives crashes |

### Validation Checklist Reference

From [user-stories.md § Validation Checklist](./user-stories.md#validation-checklist):

| Security Validation Item | How This Design Addresses It |
|--------------------------|------------------------------|
| Prompt injection cannot read existing repo content (untrusted level) | `UNTRUSTED` trust level has `canReadRepo: false` in zone permissions |
| Prompt injection cannot access credentials at any level | Credentials stored outside sandbox; no `/credentials/` zone |
| Prompt injection cannot push to GitHub without user approval | `stage()` only stages; push requires separate user action |
| Session isolation prevents cross-session data access | Each session gets unique `/session/{id}/` path |
| Audit log captures all security-relevant events | `AuditLog.log()` called on every read/write/delete |
| Trust promotion requires explicit user action | Factory functions require explicit `trustLevel` parameter |
| Blocked operations are logged and visible | `PermissionError` logged before throwing |

## Design Principles

1. **Single Interface**: One `Sandbox` interface used by all workers and tools
2. **Backend Agnostic**: Implementation details (fs, OPFS, memfs) hidden from consumers
3. **Security Parity**: Same trust levels and permissions in both environments
4. **Virtual Paths**: Workers use virtual paths; sandbox maps to real storage
5. **Explicit Boundaries**: Clear separation between zones with different trust requirements

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Worker / Tool Code                               │
│                                                                             │
│   sandbox.read('/workspace/input.pdf')                                      │
│   sandbox.write('/workspace/output.md', content)                            │
│   sandbox.stage([{path: 'analyses/report.md', content}])                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ Virtual Paths
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Sandbox Interface                              │
│                                                                             │
│   - Path resolution & validation                                            │
│   - Permission enforcement                                                  │
│   - Audit logging                                                           │
│   - Zone management                                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
┌─────────────────────────────────┐   ┌─────────────────────────────────────┐
│        CLI Backend              │   │        Browser Backend              │
│                                 │   │                                     │
│   - Node.js fs                  │   │   - OPFS                            │
│   - Real filesystem paths       │   │   - Virtual filesystem              │
│   - Git CLI for staging         │   │   - Octokit for staging             │
│   - Local .sandbox/ directory   │   │   - IndexedDB for metadata          │
│                                 │   │                                     │
└─────────────────────────────────┘   └─────────────────────────────────────┘
```

## Virtual Path Structure

Workers interact with a virtual filesystem. The sandbox maps these to real storage.

```
/                                    # Virtual root
├── session/                         # Current session's working area
│   ├── inputs/                      # Input files for this session
│   ├── working/                     # Scratch space
│   └── outputs/                     # Generated files
├── workspace/                       # Persistent workspace storage
│   ├── cache/                       # Downloaded/cached files
│   │   ├── web/                     # Fetched web content
│   │   ├── pdfs/                    # Downloaded PDFs
│   │   └── attachments/             # Other cached files
│   └── data/                        # User's workspace data
├── repo/                            # Git repository content (read-only for most)
│   └── {repo-structure}/            # Mirrors GitHub repo
├── staged/                          # Files pending commit
│   └── {commit-id}/                 # Grouped by pending commit
│       └── {files}/
└── workers/                         # Worker definitions (read-only)
    └── {worker-files}/
```

## Backend Mappings

### CLI Backend

```
Virtual Path              →    Real Path
─────────────────────────────────────────────────────────────
/session/{id}/*           →    {project}/.sandbox/sessions/{id}/*
/workspace/cache/*        →    {project}/.sandbox/cache/*
/workspace/data/*         →    {project}/.sandbox/data/*
/repo/*                   →    {project}/*  (git working tree)
/staged/*                 →    {project}/.sandbox/staged/*
/workers/*                →    {LLM_DO_PATH}/*.worker + {project}/.workers/*
```

### Browser Backend

```
Virtual Path              →    OPFS Path
─────────────────────────────────────────────────────────────
/session/{id}/*           →    /workspaces/{ws}/sessions/{id}/*
/workspace/cache/*        →    /workspaces/{ws}/cache/*
/workspace/data/*         →    /workspaces/{ws}/data/*
/repo/*                   →    /workspaces/{ws}/repo/*  (synced from GitHub)
/staged/*                 →    /workspaces/{ws}/staged/*
/workers/*                →    /workers/*  (bundled + user-defined)
```

## Zone Model

The sandbox divides paths into zones with different security characteristics:

```typescript
enum Zone {
  SESSION = 'session',       // Ephemeral, per-session storage
  WORKSPACE = 'workspace',   // Persistent workspace storage
  REPO = 'repo',             // Git repository content
  STAGED = 'staged',         // Pending commits
  WORKERS = 'workers',       // Worker definitions
}

interface ZoneConfig {
  zone: Zone;
  readable: boolean;         // Can read from this zone
  writable: boolean;         // Can write to this zone
  listable: boolean;         // Can list directory contents
  deletable: boolean;        // Can delete files
  requiresApproval: boolean; // Operations need user approval
}
```

### Zone Permissions by Trust Level

```
                    │ SESSION │ WORKSPACE │  REPO   │ STAGED  │ WORKERS │
────────────────────┼─────────┼───────────┼─────────┼─────────┼─────────┤
UNTRUSTED           │         │           │         │         │         │
  read              │   ✓     │     ✗     │    ✗    │    ✗    │    ✓    │
  write             │   ✓     │     ✗     │    ✗    │    ✓*   │    ✗    │
  list              │   ✓     │     ✗     │    ✗    │    ✗    │    ✓    │
  delete            │   ✓     │     ✗     │    ✗    │    ✗    │    ✗    │
────────────────────┼─────────┼───────────┼─────────┼─────────┼─────────┤
SESSION             │         │           │         │         │         │
  read              │   ✓     │     ✓     │    ✗    │    ✓    │    ✓    │
  write             │   ✓     │     ✓     │    ✗    │    ✓    │    ✗    │
  list              │   ✓     │     ✓     │    ✗    │    ✓    │    ✓    │
  delete            │   ✓     │     ✓     │    ✗    │    ✓    │    ✗    │
────────────────────┼─────────┼───────────┼─────────┼─────────┼─────────┤
WORKSPACE           │         │           │         │         │         │
  read              │   ✓     │     ✓     │    ✓    │    ✓    │    ✓    │
  write             │   ✓     │     ✓     │    ✗    │    ✓    │    ✗    │
  list              │   ✓     │     ✓     │    ✓    │    ✓    │    ✓    │
  delete            │   ✓     │     ✓     │    ✗    │    ✓    │    ✗    │
────────────────────┼─────────┼───────────┼─────────┼─────────┼─────────┤
FULL                │         │           │         │         │         │
  read              │   ✓     │     ✓     │    ✓    │    ✓    │    ✓    │
  write             │   ✓     │     ✓     │    ✓    │    ✓    │    ✓    │
  list              │   ✓     │     ✓     │    ✓    │    ✓    │    ✓    │
  delete            │   ✓     │     ✓     │    ✓    │    ✓    │    ✓    │

* UNTRUSTED can stage but cannot overwrite existing staged files
```

## Core Interfaces

### Sandbox Interface

```typescript
interface Sandbox {
  // ─────────────────────────────────────────────────────────────────────
  // Core File Operations
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Read file content from virtual path
   * @throws PermissionError if zone not readable
   * @throws NotFoundError if file doesn't exist
   */
  read(path: string): Promise<string>;

  /**
   * Read file as binary
   */
  readBinary(path: string): Promise<Uint8Array>;

  /**
   * Write content to virtual path
   * @throws PermissionError if zone not writable
   */
  write(path: string, content: string): Promise<void>;

  /**
   * Write binary content
   */
  writeBinary(path: string, content: Uint8Array): Promise<void>;

  /**
   * Delete file at virtual path
   * @throws PermissionError if zone not deletable
   */
  delete(path: string): Promise<void>;

  /**
   * Check if path exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * List directory contents
   * @throws PermissionError if zone not listable
   */
  list(path: string): Promise<string[]>;

  /**
   * Get file metadata
   */
  stat(path: string): Promise<FileStat>;

  // ─────────────────────────────────────────────────────────────────────
  // Path Operations
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Resolve relative path within current session
   */
  resolve(...segments: string[]): string;

  /**
   * Get zone for a virtual path
   */
  getZone(path: string): Zone;

  /**
   * Check if path is within allowed boundaries
   */
  isValidPath(path: string): boolean;

  // ─────────────────────────────────────────────────────────────────────
  // Session Management
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Get current session info
   */
  getSession(): Session;

  /**
   * Get path to session's working directory
   */
  getSessionPath(): string;

  /**
   * Create a subdirectory in session working area
   */
  createSessionDir(name: string): Promise<string>;

  // ─────────────────────────────────────────────────────────────────────
  // Staging Operations (for Git sync)
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Stage files for commit
   * @param files - Files to stage
   * @param message - Commit message for this staged commit
   * @returns Staged commit ID
   */
  stage(files: StageRequest[], message: string): Promise<string>;

  /**
   * Get list of staged commits
   */
  getStagedCommits(): Promise<StagedCommit[]>;

  /**
   * Get specific staged commit
   */
  getStagedCommit(commitId: string): Promise<StagedCommit>;

  /**
   * Discard a staged commit
   */
  discardStaged(commitId: string): Promise<void>;

  // ─────────────────────────────────────────────────────────────────────
  // Security
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Get current security context
   */
  getSecurityContext(): SecurityContext;

  /**
   * Check if operation is permitted
   */
  checkPermission(operation: Operation, path: string): PermissionCheck;

  /**
   * Assert permission (throws if denied)
   */
  assertPermission(operation: Operation, path: string): void;
}

// ─────────────────────────────────────────────────────────────────────────
// Error Types
// ─────────────────────────────────────────────────────────────────────────

/**
 * Base class for all sandbox errors.
 */
class SandboxError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly path?: string
  ) {
    super(message);
    this.name = 'SandboxError';
  }
}

/**
 * Thrown when an operation is not permitted by the security context.
 */
class PermissionError extends SandboxError {
  constructor(message: string, path?: string) {
    super('PERMISSION_DENIED', message, path);
    this.name = 'PermissionError';
  }
}

/**
 * Thrown when a file or directory is not found.
 */
class NotFoundError extends SandboxError {
  constructor(path: string) {
    super('NOT_FOUND', `File or directory not found: ${path}`, path);
    this.name = 'NotFoundError';
  }
}

/**
 * Thrown when a path is invalid or attempts to escape boundaries.
 */
class InvalidPathError extends SandboxError {
  constructor(message: string, path?: string) {
    super('INVALID_PATH', message, path);
    this.name = 'InvalidPathError';
  }
}

/**
 * Thrown when a file already exists and overwrite is not permitted.
 */
class FileExistsError extends SandboxError {
  constructor(path: string) {
    super('FILE_EXISTS', `File already exists: ${path}`, path);
    this.name = 'FileExistsError';
  }
}

/**
 * Thrown when storage quota is exceeded.
 */
class QuotaExceededError extends SandboxError {
  constructor(message: string = 'Storage quota exceeded') {
    super('QUOTA_EXCEEDED', message);
    this.name = 'QuotaExceededError';
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Audit Log Types
// ─────────────────────────────────────────────────────────────────────────

/**
 * Entry in the audit log.
 */
interface AuditEntry {
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
interface AuditFilter {
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
interface AuditLog {
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

// ─────────────────────────────────────────────────────────────────────────
// Supporting Types
// ─────────────────────────────────────────────────────────────────────────

interface FileStat {
  path: string;
  zone: Zone;
  size: number;
  createdAt: Date;
  modifiedAt: Date;
  isDirectory: boolean;
}

interface StageRequest {
  /** Target path in repo (relative to repo root) */
  repoPath: string;
  /** Content to stage */
  content: string;
  /** Commit message for this file (optional, can be grouped) */
  message?: string;
}

interface StagedCommit {
  id: string;
  sessionId: string;
  createdAt: Date;
  message: string;
  files: StagedFile[];
  status: 'pending' | 'approved' | 'committed' | 'rejected';
}

interface StagedFile {
  repoPath: string;
  operation: 'create' | 'update' | 'delete';
  size: number;
  hash: string;
}

type Operation = 'read' | 'write' | 'delete' | 'list';

interface PermissionCheck {
  allowed: boolean;
  reason?: string;
  zone: Zone;
  trustLevel: TrustLevel;
}

interface Session {
  id: string;
  workspaceId: string;
  createdAt: Date;
  trustLevel: TrustLevel;
  sourceContext: SourceContext;
}

interface SourceContext {
  type: 'cli' | 'browser_action' | 'web_content' | 'api';
  origin?: string;
  userInitiated: boolean;
}

type TrustLevel = 'untrusted' | 'session' | 'workspace' | 'full';

interface SecurityContext {
  trustLevel: TrustLevel;
  sessionId: string;
  origin: string | null;
  permissions: ZonePermissions;
}

interface ZonePermissions {
  [Zone.SESSION]: ZoneConfig;
  [Zone.WORKSPACE]: ZoneConfig;
  [Zone.REPO]: ZoneConfig;
  [Zone.STAGED]: ZoneConfig;
  [Zone.WORKERS]: ZoneConfig;
}
```

### SandboxBackend Interface

```typescript
/**
 * Backend implementation interface.
 * CLI and Browser provide different implementations.
 */
interface SandboxBackend {
  // Raw file operations (no permission checking)
  readFile(realPath: string): Promise<string>;
  readFileBinary(realPath: string): Promise<Uint8Array>;
  writeFile(realPath: string, content: string): Promise<void>;
  writeFileBinary(realPath: string, content: Uint8Array): Promise<void>;
  deleteFile(realPath: string): Promise<void>;
  exists(realPath: string): Promise<boolean>;
  listDir(realPath: string): Promise<string[]>;
  stat(realPath: string): Promise<BackendFileStat>;
  mkdir(realPath: string): Promise<void>;

  // Path mapping
  mapVirtualToReal(virtualPath: string, zone: Zone): string;
  mapRealToVirtual(realPath: string): string | null;

  // Backend-specific initialization
  initialize(config: BackendConfig): Promise<void>;
  dispose(): Promise<void>;
}

interface BackendConfig {
  workspaceId: string;
  sessionId: string;
  // CLI-specific
  projectRoot?: string;
  sandboxDir?: string;
  // Browser-specific
  opfsRoot?: FileSystemDirectoryHandle;
}

/**
 * File stat returned by backend (raw filesystem info).
 * Unlike FileStat, this doesn't include zone information.
 */
interface BackendFileStat {
  size: number;
  createdAt: Date;
  modifiedAt: Date;
  isDirectory: boolean;
}
```

## Implementation

### Core Sandbox Class

```typescript
class SandboxImpl implements Sandbox {
  private backend: SandboxBackend;
  private session: Session;
  private securityContext: SecurityContext;
  private auditLog: AuditLog;

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

  async read(path: string): Promise<string> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);

    // Permission check
    this.assertPermission('read', normalizedPath);

    // Audit
    await this.auditLog.log({
      operation: 'read',
      path: normalizedPath,
      zone,
      sessionId: this.session.id,
      trustLevel: this.securityContext.trustLevel,
    });

    // Map to real path and read
    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    return this.backend.readFile(realPath);
  }

  async write(path: string, content: string): Promise<void> {
    const normalizedPath = this.normalizePath(path);
    const zone = this.getZone(normalizedPath);

    // Permission check
    this.assertPermission('write', normalizedPath);

    // Additional check: untrusted cannot overwrite in staged
    if (
      zone === Zone.STAGED &&
      this.securityContext.trustLevel === 'untrusted'
    ) {
      const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
      if (await this.backend.exists(realPath)) {
        throw new PermissionError(
          'Untrusted sessions cannot overwrite staged files',
          normalizedPath
        );
      }
    }

    // Audit
    await this.auditLog.log({
      operation: 'write',
      path: normalizedPath,
      zone,
      sessionId: this.session.id,
      trustLevel: this.securityContext.trustLevel,
      contentSize: content.length,
    });

    // Map to real path and write
    const realPath = this.backend.mapVirtualToReal(normalizedPath, zone);
    await this.ensureDir(realPath);
    await this.backend.writeFile(realPath, content);
  }

  getZone(path: string): Zone {
    const normalized = this.normalizePath(path);
    const segments = normalized.split('/').filter(Boolean);

    if (segments.length === 0) {
      throw new InvalidPathError('Cannot determine zone for root path');
    }

    const zoneSegment = segments[0];
    switch (zoneSegment) {
      case 'session':
        return Zone.SESSION;
      case 'workspace':
        return Zone.WORKSPACE;
      case 'repo':
        return Zone.REPO;
      case 'staged':
        return Zone.STAGED;
      case 'workers':
        return Zone.WORKERS;
      default:
        throw new InvalidPathError(`Unknown zone: ${zoneSegment}`);
    }
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
      throw new PermissionError(check.reason!, path);
    }
  }

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
      throw new InvalidPathError('Path escape attempt detected');
    }

    return normalized;
  }

  // ... other methods
}
```

### CLI Backend

```typescript
class CLIBackend implements SandboxBackend {
  private projectRoot: string;
  private sandboxDir: string;
  private sessionId: string;

  async initialize(config: BackendConfig): Promise<void> {
    this.projectRoot = config.projectRoot!;
    this.sandboxDir = config.sandboxDir || path.join(this.projectRoot, '.sandbox');
    this.sessionId = config.sessionId;

    // Ensure sandbox directory exists
    await fs.mkdir(this.sandboxDir, { recursive: true });
    await fs.mkdir(path.join(this.sandboxDir, 'sessions', this.sessionId), { recursive: true });
    await fs.mkdir(path.join(this.sandboxDir, 'cache'), { recursive: true });
    await fs.mkdir(path.join(this.sandboxDir, 'data'), { recursive: true });
    await fs.mkdir(path.join(this.sandboxDir, 'staged'), { recursive: true });
  }

  mapVirtualToReal(virtualPath: string, zone: Zone): string {
    const relativePath = virtualPath.split('/').slice(2).join('/'); // Remove zone prefix

    switch (zone) {
      case Zone.SESSION:
        return path.join(this.sandboxDir, 'sessions', relativePath);
      case Zone.WORKSPACE:
        if (virtualPath.startsWith('/workspace/cache')) {
          return path.join(this.sandboxDir, 'cache', relativePath.replace(/^cache\//, ''));
        }
        return path.join(this.sandboxDir, 'data', relativePath.replace(/^data\//, ''));
      case Zone.REPO:
        return path.join(this.projectRoot, relativePath);
      case Zone.STAGED:
        return path.join(this.sandboxDir, 'staged', relativePath);
      case Zone.WORKERS:
        return this.resolveWorkerPath(relativePath);
    }
  }

  private resolveWorkerPath(relativePath: string): string {
    // Check project workers first
    const projectWorkers = path.join(this.projectRoot, '.workers', relativePath);
    if (fs.existsSync(projectWorkers)) {
      return projectWorkers;
    }

    // Check LLM_DO_PATH
    const searchPaths = (process.env.LLM_DO_PATH || '').split(':');
    for (const searchPath of searchPaths) {
      const candidate = path.join(searchPath, relativePath);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    throw new NotFoundError(`Worker not found: ${relativePath}`);
  }

  async readFile(realPath: string): Promise<string> {
    return fs.readFile(realPath, 'utf-8');
  }

  async writeFile(realPath: string, content: string): Promise<void> {
    await fs.mkdir(path.dirname(realPath), { recursive: true });
    await fs.writeFile(realPath, content, 'utf-8');
  }

  // ... other methods
}
```

### Browser Backend

```typescript
class BrowserBackend implements SandboxBackend {
  private opfsRoot: FileSystemDirectoryHandle;
  private workspaceId: string;
  private sessionId: string;

  async initialize(config: BackendConfig): Promise<void> {
    this.opfsRoot = await navigator.storage.getDirectory();
    this.workspaceId = config.workspaceId;
    this.sessionId = config.sessionId;

    // Ensure directory structure exists
    await this.ensureDir(`/workspaces/${this.workspaceId}/sessions/${this.sessionId}`);
    await this.ensureDir(`/workspaces/${this.workspaceId}/cache`);
    await this.ensureDir(`/workspaces/${this.workspaceId}/data`);
    await this.ensureDir(`/workspaces/${this.workspaceId}/staged`);
    await this.ensureDir(`/workspaces/${this.workspaceId}/repo`);
  }

  mapVirtualToReal(virtualPath: string, zone: Zone): string {
    const relativePath = virtualPath.split('/').slice(2).join('/');
    const ws = this.workspaceId;

    switch (zone) {
      case Zone.SESSION:
        return `/workspaces/${ws}/sessions/${relativePath}`;
      case Zone.WORKSPACE:
        if (virtualPath.startsWith('/workspace/cache')) {
          return `/workspaces/${ws}/cache/${relativePath.replace(/^cache\//, '')}`;
        }
        return `/workspaces/${ws}/data/${relativePath.replace(/^data\//, '')}`;
      case Zone.REPO:
        return `/workspaces/${ws}/repo/${relativePath}`;
      case Zone.STAGED:
        return `/workspaces/${ws}/staged/${relativePath}`;
      case Zone.WORKERS:
        return `/workers/${relativePath}`;
    }
  }

  async readFile(realPath: string): Promise<string> {
    const fileHandle = await this.getFileHandle(realPath);
    const file = await fileHandle.getFile();
    return file.text();
  }

  async writeFile(realPath: string, content: string): Promise<void> {
    const fileHandle = await this.getFileHandle(realPath, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  private async getFileHandle(
    path: string,
    options?: { create?: boolean }
  ): Promise<FileSystemFileHandle> {
    const segments = path.split('/').filter(Boolean);
    const fileName = segments.pop()!;

    let dir = this.opfsRoot;
    for (const segment of segments) {
      dir = await dir.getDirectoryHandle(segment, options);
    }

    return dir.getFileHandle(fileName, options);
  }

  // ... other methods
}
```

## Factory Functions

```typescript
/**
 * Create sandbox for CLI environment
 */
async function createCLISandbox(options: {
  projectRoot: string;
  trustLevel?: TrustLevel;
  sourceContext?: SourceContext;
}): Promise<Sandbox> {
  const sessionId = generateId();
  const trustLevel = options.trustLevel || 'session'; // CLI defaults to session trust

  const session: Session = {
    id: sessionId,
    workspaceId: 'cli',
    createdAt: new Date(),
    trustLevel,
    sourceContext: options.sourceContext || {
      type: 'cli',
      userInitiated: true,
    },
  };

  const backend = new CLIBackend();
  await backend.initialize({
    workspaceId: 'cli',
    sessionId,
    projectRoot: options.projectRoot,
  });

  const securityContext = createSecurityContext(trustLevel, session);
  const auditLog = new FileAuditLog(path.join(options.projectRoot, '.sandbox', 'audit.log'));

  return new SandboxImpl(backend, session, securityContext, auditLog);
}

/**
 * Create sandbox for browser environment
 */
async function createBrowserSandbox(options: {
  workspaceId: string;
  trustLevel?: TrustLevel;
  sourceContext: SourceContext;
}): Promise<Sandbox> {
  const sessionId = generateId();

  // Browser defaults to untrusted for web content
  const trustLevel = options.trustLevel ||
    (options.sourceContext.type === 'web_content' ? 'untrusted' : 'session');

  const session: Session = {
    id: sessionId,
    workspaceId: options.workspaceId,
    createdAt: new Date(),
    trustLevel,
    sourceContext: options.sourceContext,
  };

  const backend = new BrowserBackend();
  await backend.initialize({
    workspaceId: options.workspaceId,
    sessionId,
  });

  const securityContext = createSecurityContext(trustLevel, session);
  const auditLog = new IndexedDBAuditLog(options.workspaceId);

  return new SandboxImpl(backend, session, securityContext, auditLog);
}

/**
 * Create security context from trust level
 */
function createSecurityContext(
  trustLevel: TrustLevel,
  session: Session
): SecurityContext {
  return {
    trustLevel,
    sessionId: session.id,
    origin: session.sourceContext.origin || null,
    permissions: PERMISSION_PROFILES[trustLevel],
  };
}

const PERMISSION_PROFILES: Record<TrustLevel, ZonePermissions> = {
  untrusted: {
    [Zone.SESSION]: { readable: true, writable: true, listable: true, deletable: true, requiresApproval: false },
    [Zone.WORKSPACE]: { readable: false, writable: false, listable: false, deletable: false, requiresApproval: false },
    [Zone.REPO]: { readable: false, writable: false, listable: false, deletable: false, requiresApproval: false },
    [Zone.STAGED]: { readable: false, writable: true, listable: false, deletable: false, requiresApproval: true },
    [Zone.WORKERS]: { readable: true, writable: false, listable: true, deletable: false, requiresApproval: false },
  },
  session: {
    [Zone.SESSION]: { readable: true, writable: true, listable: true, deletable: true, requiresApproval: false },
    [Zone.WORKSPACE]: { readable: true, writable: true, listable: true, deletable: true, requiresApproval: false },
    [Zone.REPO]: { readable: false, writable: false, listable: false, deletable: false, requiresApproval: false },
    [Zone.STAGED]: { readable: true, writable: true, listable: true, deletable: true, requiresApproval: false },
    [Zone.WORKERS]: { readable: true, writable: false, listable: true, deletable: false, requiresApproval: false },
  },
  workspace: {
    [Zone.SESSION]: { readable: true, writable: true, listable: true, deletable: true, requiresApproval: false },
    [Zone.WORKSPACE]: { readable: true, writable: true, listable: true, deletable: true, requiresApproval: false },
    [Zone.REPO]: { readable: true, writable: false, listable: true, deletable: false, requiresApproval: false },
    [Zone.STAGED]: { readable: true, writable: true, listable: true, deletable: true, requiresApproval: false },
    [Zone.WORKERS]: { readable: true, writable: false, listable: true, deletable: false, requiresApproval: false },
  },
  full: {
    [Zone.SESSION]: { readable: true, writable: true, listable: true, deletable: true, requiresApproval: false },
    [Zone.WORKSPACE]: { readable: true, writable: true, listable: true, deletable: true, requiresApproval: false },
    [Zone.REPO]: { readable: true, writable: true, listable: true, deletable: true, requiresApproval: false },
    [Zone.STAGED]: { readable: true, writable: true, listable: true, deletable: true, requiresApproval: false },
    [Zone.WORKERS]: { readable: true, writable: true, listable: true, deletable: true, requiresApproval: false },
  },
};
```

## Filesystem Tools

Tools use the sandbox interface, unaware of the backend:

```typescript
import { z } from 'zod';
import { Sandbox } from './sandbox';

export function createFilesystemTools(sandbox: Sandbox) {
  return [
    {
      name: 'read_file',
      description: 'Read content from a file',
      parameters: z.object({
        path: z.string().describe('Path to the file to read'),
      }),
      execute: async ({ path }) => {
        try {
          const content = await sandbox.read(path);
          return { success: true, content };
        } catch (error) {
          if (error instanceof PermissionError) {
            return {
              success: false,
              error: `Permission denied: ${error.message}`,
              hint: 'This file is outside your accessible zones.',
            };
          }
          throw error;
        }
      },
      // Approval protocol
      needsApproval: (args: { path: string }) => {
        const check = sandbox.checkPermission('read', args.path);
        if (!check.allowed) {
          return { status: 'blocked', reason: check.reason };
        }
        // Reading from repo might need approval at some trust levels
        if (check.zone === Zone.REPO) {
          return { status: 'needs_approval' };
        }
        return { status: 'pre_approved' };
      },
    },

    {
      name: 'write_file',
      description: 'Write content to a file',
      parameters: z.object({
        path: z.string().describe('Path to write to'),
        content: z.string().describe('Content to write'),
      }),
      execute: async ({ path, content }) => {
        try {
          await sandbox.write(path, content);
          return { success: true, path, bytesWritten: content.length };
        } catch (error) {
          if (error instanceof PermissionError) {
            return {
              success: false,
              error: `Permission denied: ${error.message}`,
            };
          }
          throw error;
        }
      },
      needsApproval: (args: { path: string }) => {
        const check = sandbox.checkPermission('write', args.path);
        if (!check.allowed) {
          return { status: 'blocked', reason: check.reason };
        }
        return { status: 'pre_approved' };
      },
    },

    {
      name: 'list_files',
      description: 'List files in a directory',
      parameters: z.object({
        path: z.string().describe('Directory path to list'),
      }),
      execute: async ({ path }) => {
        try {
          const files = await sandbox.list(path);
          return { success: true, files };
        } catch (error) {
          if (error instanceof PermissionError) {
            return {
              success: false,
              error: `Permission denied: ${error.message}`,
            };
          }
          throw error;
        }
      },
      needsApproval: (args: { path: string }) => {
        const check = sandbox.checkPermission('list', args.path);
        if (!check.allowed) {
          return { status: 'blocked', reason: check.reason };
        }
        return { status: 'pre_approved' };
      },
    },

    {
      name: 'stage_for_commit',
      description: 'Stage files for committing to the repository',
      parameters: z.object({
        files: z.array(z.object({
          path: z.string().describe('Path in repository'),
          content: z.string().describe('File content'),
        })),
        message: z.string().describe('Commit message'),
      }),
      execute: async ({ files, message }) => {
        const stageRequests = files.map(f => ({
          repoPath: f.path,
          content: f.content,
        }));
        const commitId = await sandbox.stage(stageRequests, message);
        return {
          success: true,
          commitId,
          stagedFiles: files.length,
          message: 'Files staged. User must approve before push.',
        };
      },
      needsApproval: () => {
        // Staging always needs approval
        return { status: 'needs_approval' };
      },
      getApprovalDescription: (args) => {
        const paths = args.files.map(f => f.path).join(', ');
        return `Stage ${args.files.length} file(s) for commit: ${paths}`;
      },
    },
  ];
}
```

## Testing Support

For testing, use an in-memory backend:

```typescript
class MemoryBackend implements SandboxBackend {
  private files: Map<string, string> = new Map();
  private directories: Set<string> = new Set();

  async initialize(config: BackendConfig): Promise<void> {
    this.directories.add('/');
  }

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) {
      throw new NotFoundError(path);
    }
    return content;
  }

  async writeFile(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.directories.has(path);
  }

  // ... other methods

  // Test helpers
  getFiles(): Map<string, string> {
    return new Map(this.files);
  }

  reset(): void {
    this.files.clear();
    this.directories.clear();
    this.directories.add('/');
  }
}

// Usage in tests
describe('Sandbox', () => {
  let sandbox: Sandbox;
  let backend: MemoryBackend;

  beforeEach(async () => {
    backend = new MemoryBackend();
    sandbox = await createTestSandbox(backend, { trustLevel: 'session' });
  });

  it('should allow writing to session directory', async () => {
    await sandbox.write('/session/test/file.txt', 'hello');
    const content = await sandbox.read('/session/test/file.txt');
    expect(content).toBe('hello');
  });

  it('should block untrusted from reading repo', async () => {
    sandbox = await createTestSandbox(backend, { trustLevel: 'untrusted' });
    await expect(sandbox.read('/repo/secret.txt')).rejects.toThrow(PermissionError);
  });
});
```

## Integration with Approval System

The sandbox integrates with the approval system from the core library:

```typescript
class SandboxToolset implements Toolset {
  private sandbox: Sandbox;

  constructor(sandbox: Sandbox) {
    this.sandbox = sandbox;
  }

  getTools(): Tool[] {
    return createFilesystemTools(this.sandbox);
  }

  needsApproval(name: string, args: Record<string, unknown>): ApprovalResult {
    const tool = this.getTools().find(t => t.name === name);
    if (tool?.needsApproval) {
      return tool.needsApproval(args);
    }
    return { status: 'pre_approved' };
  }

  getApprovalDescription(name: string, args: Record<string, unknown>): string {
    const tool = this.getTools().find(t => t.name === name);
    if (tool?.getApprovalDescription) {
      return tool.getApprovalDescription(args);
    }
    return `Execute ${name}`;
  }
}
```

## Summary

This design provides:

1. **Unified Interface**: Workers use the same `Sandbox` API regardless of runtime
2. **Backend Flexibility**: CLI uses real fs, browser uses OPFS, tests use memory
3. **Security Enforcement**: Permission checks happen in the core, not backends
4. **Zone-Based Access**: Clear boundaries between session/workspace/repo/staged
5. **Audit Trail**: All operations logged for security review
6. **Testing Support**: Memory backend enables fast, isolated tests

---

## Verification Tests

These tests verify the design meets requirements from [user-stories.md](./user-stories.md).

### Security Tests (Stories 2.1-2.5, 6.1)

```typescript
describe('Security: Untrusted Content Isolation', () => {
  // Story 2.3: Block Suspicious Operations
  it('blocks untrusted session from reading repo content', async () => {
    const sandbox = await createTestSandbox({ trustLevel: 'untrusted' });

    await expect(sandbox.read('/repo/secrets.md'))
      .rejects.toThrow(PermissionError);

    // Verify audit log captured the attempt
    const logs = await auditLog.getEntries({ operation: 'read' });
    expect(logs).toContainEqual(expect.objectContaining({
      path: '/repo/secrets.md',
      allowed: false,
      trustLevel: 'untrusted',
    }));
  });

  // Story 2.3: Block exfiltration via workspace
  it('blocks untrusted session from reading workspace data', async () => {
    const sandbox = await createTestSandbox({ trustLevel: 'untrusted' });

    await expect(sandbox.read('/workspace/data/previous-analysis.md'))
      .rejects.toThrow(PermissionError);
  });

  // Story 2.4: Untrusted can stage but not overwrite
  it('allows untrusted to stage new files but not overwrite', async () => {
    const sandbox = await createTestSandbox({ trustLevel: 'untrusted' });

    // First stage succeeds
    await sandbox.write('/staged/commit-1/new-file.md', 'content');

    // Overwrite fails
    await expect(sandbox.write('/staged/commit-1/new-file.md', 'malicious'))
      .rejects.toThrow(PermissionError);
  });

  // Story 2.1: Trust level visibility
  it('exposes trust level via security context', async () => {
    const sandbox = await createTestSandbox({ trustLevel: 'untrusted' });

    const ctx = sandbox.getSecurityContext();
    expect(ctx.trustLevel).toBe('untrusted');
    expect(ctx.permissions[Zone.REPO].readable).toBe(false);
  });
});

describe('Security: Session Isolation', () => {
  // Story 1.2: Batch analysis isolation
  it('isolates sessions from each other', async () => {
    const session1 = await createTestSandbox({ trustLevel: 'session' });
    const session2 = await createTestSandbox({ trustLevel: 'session' });

    await session1.write('/session/working/secret.md', 'session1 data');

    // Session 2 cannot read session 1's data
    const session1Path = `/session/${session1.getSession().id}/working/secret.md`;
    await expect(session2.read(session1Path))
      .rejects.toThrow(); // Either PermissionError or NotFoundError
  });
});

describe('Security: Audit Logging', () => {
  // Story 6.1: View Audit Log
  it('logs all file operations', async () => {
    const sandbox = await createTestSandbox({ trustLevel: 'session' });

    await sandbox.write('/session/working/file.md', 'content');
    await sandbox.read('/session/working/file.md');
    await sandbox.list('/session/working');

    const logs = await auditLog.getEntries({ sessionId: sandbox.getSession().id });
    expect(logs).toHaveLength(3);
    expect(logs.map(l => l.operation)).toEqual(['write', 'read', 'list']);
  });
});
```

### Functional Tests (Stories 1.1-1.3, 3.2, 4.1)

```typescript
describe('Functional: PDF Analysis Workflow', () => {
  // Story 1.1: Analyze PDF from Web Search
  it('supports caching downloaded PDFs', async () => {
    const sandbox = await createTestSandbox({ trustLevel: 'session' });

    // Cache PDF
    const pdfContent = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    await sandbox.writeBinary('/workspace/cache/pdfs/report.pdf', pdfContent);

    // Verify cached
    expect(await sandbox.exists('/workspace/cache/pdfs/report.pdf')).toBe(true);

    // Write analysis to session
    await sandbox.write('/session/working/analysis.md', '# Analysis\n...');

    // Stage for commit
    await sandbox.stage([{
      repoPath: 'analyses/report-analysis.md',
      content: '# Analysis\n...',
    }]);

    const staged = await sandbox.getStagedCommits();
    expect(staged).toHaveLength(1);
  });

  // Story 1.3: Continue Analysis in VS Code
  it('stages files for git sync', async () => {
    const sandbox = await createTestSandbox({ trustLevel: 'session' });

    const commitId = await sandbox.stage([
      { repoPath: 'docs/analysis.md', content: '# Analysis' },
      { repoPath: 'docs/summary.md', content: '# Summary' },
    ]);

    const commit = await sandbox.getStagedCommit(commitId);
    expect(commit.files).toHaveLength(2);
    expect(commit.status).toBe('pending');
  });
});

describe('Functional: Workspace Persistence', () => {
  // Story 3.2: Work Offline
  it('persists workspace data across sessions', async () => {
    // Session 1: write data
    const sandbox1 = await createTestSandbox({
      trustLevel: 'session',
      workspaceId: 'test-workspace',
    });
    await sandbox1.write('/workspace/data/notes.md', 'My notes');

    // Session 2: read data (simulating restart)
    const sandbox2 = await createTestSandbox({
      trustLevel: 'session',
      workspaceId: 'test-workspace',
    });
    const content = await sandbox2.read('/workspace/data/notes.md');
    expect(content).toBe('My notes');
  });
});

describe('Functional: Multi-Workspace Isolation', () => {
  // Story 3.4: Multiple Workspaces
  it('isolates workspaces from each other', async () => {
    const workspace1 = await createTestSandbox({
      trustLevel: 'session',
      workspaceId: 'project-a',
    });
    const workspace2 = await createTestSandbox({
      trustLevel: 'session',
      workspaceId: 'project-b',
    });

    await workspace1.write('/workspace/data/secret.md', 'project-a secret');

    // Workspace 2 cannot access workspace 1's data
    await expect(workspace2.read('/workspace/data/secret.md'))
      .rejects.toThrow(NotFoundError);
  });
});
```

### Backend Parity Tests

```typescript
describe('Backend Parity: CLI and Browser behave identically', () => {
  const backends = [
    { name: 'CLI', factory: createCLIBackend },
    { name: 'Browser', factory: createBrowserBackend },
    { name: 'Memory', factory: createMemoryBackend },
  ];

  backends.forEach(({ name, factory }) => {
    describe(`${name} Backend`, () => {
      it('maps virtual paths correctly', async () => {
        const backend = await factory();
        const sandbox = new SandboxImpl(backend, testSession, testContext, testAuditLog);

        await sandbox.write('/session/working/test.md', 'content');
        const content = await sandbox.read('/session/working/test.md');
        expect(content).toBe('content');
      });

      it('enforces same permission model', async () => {
        const backend = await factory();
        const sandbox = new SandboxImpl(backend, testSession, untrustedContext, testAuditLog);

        await expect(sandbox.read('/repo/file.md'))
          .rejects.toThrow(PermissionError);
      });
    });
  });
});
```

### Trust Level Promotion Tests

```typescript
describe('Trust Level Transitions', () => {
  // Story 2.2: Promote Trust Level
  it('workspace trust enables repo reading', async () => {
    // Start untrusted
    let sandbox = await createTestSandbox({ trustLevel: 'untrusted' });
    await expect(sandbox.read('/repo/data.md')).rejects.toThrow(PermissionError);

    // Promote to workspace (requires user action in real implementation)
    sandbox = await createTestSandbox({ trustLevel: 'workspace' });

    // Now can read repo
    // (assuming /repo/data.md exists in test fixture)
    const content = await sandbox.read('/repo/data.md');
    expect(content).toBeDefined();
  });

  it('full trust enables repo writing', async () => {
    const sandbox = await createTestSandbox({ trustLevel: 'full' });

    await sandbox.write('/repo/new-file.md', 'content');
    expect(await sandbox.exists('/repo/new-file.md')).toBe(true);
  });
});
```

### Error Recovery Tests

```typescript
describe('Error Recovery', () => {
  // Story 7.1: Recover from Failed Push
  it('preserves staged files after failed operations', async () => {
    const sandbox = await createTestSandbox({ trustLevel: 'session' });

    // Stage files
    const commitId = await sandbox.stage([
      { repoPath: 'file.md', content: 'important content' },
    ]);

    // Simulate failure (e.g., network error during push)
    // ... push fails ...

    // Staged files still accessible
    const commit = await sandbox.getStagedCommit(commitId);
    expect(commit.status).toBe('pending');
    expect(commit.files).toHaveLength(1);
  });

  // Story 7.3: Session Recovery After Crash
  it('persists session data for crash recovery', async () => {
    const sessionId = 'recovery-test-session';

    // Session 1: write work in progress
    const sandbox1 = await createTestSandbox({
      trustLevel: 'session',
      sessionId,
    });
    await sandbox1.write('/session/working/draft.md', 'work in progress');

    // Simulate crash (just create new sandbox with same session ID)
    const sandbox2 = await createTestSandbox({
      trustLevel: 'session',
      sessionId,
    });

    // Data survives
    const content = await sandbox2.read('/session/working/draft.md');
    expect(content).toBe('work in progress');
  });
});
```

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2024-XX-XX | Initial design |

## Open Questions

1. Should session directories auto-expire after a configurable time?
2. How to handle storage quota exceeded in browser?
3. Should there be a `/shared/` zone for cross-session data at lower trust levels?
