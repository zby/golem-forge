/**
 * Mount-based Sandbox Types
 *
 * Docker-style bind mount model for sandboxing.
 * See docs/notes/sandbox-mount-model.md for design details.
 */

import { z } from 'zod';
import type { FileStat } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Common Interface for File Operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Common file operations interface.
 * Both zone-based Sandbox and mount-based MountSandbox implement this.
 * Use this type when you only need file operations without zone/mount specifics.
 */
export interface FileOperations {
  /** Read file content */
  read(path: string): Promise<string>;

  /** Read file as binary */
  readBinary(path: string): Promise<Uint8Array>;

  /** Write content to file */
  write(path: string, content: string): Promise<void>;

  /** Write binary content */
  writeBinary(path: string, content: Uint8Array): Promise<void>;

  /** Delete file */
  delete(path: string): Promise<void>;

  /** Check if path exists */
  exists(path: string): Promise<boolean>;

  /** List directory contents */
  list(path: string): Promise<string[]>;

  /** Get file metadata */
  stat(path: string): Promise<FileStat>;

  /** Resolve virtual path to real filesystem path */
  resolve(path: string): string;

  /** Check if path is valid */
  isValidPath(path: string): boolean;
}

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
// Zod Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const MountSchema = z.object({
  source: z.string().min(1),
  target: z.string().startsWith('/'),
  readonly: z.boolean().optional().default(false),
});

export const MountSandboxConfigSchema = z.object({
  root: z.string().min(1),
  readonly: z.boolean().optional().default(false),
  mounts: z.array(MountSchema).optional(),
});

export const SubWorkerRestrictionSchema = z.object({
  restrict: z.string().startsWith('/').optional(),
  readonly: z.boolean().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Types derived from schemas
// ─────────────────────────────────────────────────────────────────────────────

export type MountInput = z.input<typeof MountSchema>;
export type MountSandboxConfigInput = z.input<typeof MountSandboxConfigSchema>;
export type SubWorkerRestrictionInput = z.input<typeof SubWorkerRestrictionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Resolved Mount (internal use)
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
