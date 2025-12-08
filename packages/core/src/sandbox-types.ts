/**
 * Shared Sandbox Types
 *
 * Platform-agnostic type definitions for sandbox implementations.
 * Used by both CLI (Node.js fs) and browser (OPFS) implementations.
 *
 * @module shared/sandbox-types
 */

// ─────────────────────────────────────────────────────────────────────────────
// File Metadata
// ─────────────────────────────────────────────────────────────────────────────

/**
 * File metadata returned by stat operations.
 */
export interface FileStat {
  path: string;
  size: number;
  createdAt: Date;
  modifiedAt: Date;
  isDirectory: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// File Operations Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Common file operations interface.
 *
 * This is the core abstraction that allows different backends:
 * - CLI: Node.js fs-based MountSandboxImpl
 * - Browser: OPFS-based OPFSSandbox
 *
 * Use this type when you only need file operations without mount specifics.
 */
export interface FileOperations {
  /** Read file content as UTF-8 string */
  read(path: string): Promise<string>;

  /** Read file as binary */
  readBinary(path: string): Promise<Uint8Array>;

  /** Write string content to file (creates parent directories) */
  write(path: string, content: string): Promise<void>;

  /** Write binary content to file */
  writeBinary(path: string, content: Uint8Array): Promise<void>;

  /** Delete file */
  delete(path: string): Promise<void>;

  /** Check if path exists */
  exists(path: string): Promise<boolean>;

  /** List directory contents (returns entry names, not full paths) */
  list(path: string): Promise<string[]>;

  /** Get file metadata */
  stat(path: string): Promise<FileStat>;

  /** Resolve virtual path to real filesystem path */
  resolve(path: string): string;

  /** Check if path is valid (absolute, no escape attempts) */
  isValidPath(path: string): boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mount Configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A mount point that maps a real filesystem path to a virtual path.
 * Similar to Docker's `--mount type=bind,source=...,target=...`
 */
export interface Mount {
  /** Real filesystem path (Docker: "source" or "src") */
  source: string;

  /** Virtual path inside sandbox (Docker: "target" or "dst") */
  target: string;

  /** Read-only mount (Docker: "readonly"). Default: false */
  readonly?: boolean;
}

/**
 * Mount-based sandbox configuration.
 * Uses Docker bind mount terminology.
 */
export interface MountSandboxConfig {
  /** Real filesystem path to mount at / */
  root: string;

  /** Read-only mount. Default: false (read-write) */
  readonly?: boolean;

  /** Additional mount points (overlay the root) */
  mounts?: Mount[];
}

/**
 * Configuration for restricting a sandbox for a sub-worker.
 */
export interface SubWorkerRestriction {
  /** Restrict to subtree (e.g., "/src"). Omit for full access. */
  restrict?: string;

  /** Make read-only. Can only add restriction, not remove. */
  readonly?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolved Configuration (Internal)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A mount with resolved absolute paths.
 */
export interface ResolvedMount {
  /** Absolute real filesystem path */
  source: string;

  /** Virtual path (always starts with /) */
  target: string;

  /** Read-only flag */
  readonly: boolean;
}

/**
 * Resolved sandbox configuration (internal use).
 */
export interface ResolvedMountConfig {
  /** Absolute path to root mount */
  root: string;

  /** Root is read-only */
  readonly: boolean;

  /** Additional mounts, sorted by target path length (longest first for matching) */
  mounts: ResolvedMount[];
}

// ─────────────────────────────────────────────────────────────────────────────
// MountSandbox Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extended sandbox interface with mount-specific operations.
 *
 * Implementations:
 * - CLI: MountSandboxImpl (src/sandbox/mount-sandbox.ts)
 * - Browser: OPFSSandbox (browser-extension/src/services/opfs-sandbox.ts)
 */
export interface MountSandbox extends FileOperations {
  /** Check if path is writable (not in readonly mount) */
  canWrite(path: string): boolean;

  /** Create a restricted sandbox for a sub-worker */
  restrict(config: SubWorkerRestriction): MountSandbox;

  /** Get the resolved configuration */
  getConfig(): ResolvedMountConfig;
}
