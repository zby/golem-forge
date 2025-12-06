/**
 * Sandbox Interfaces
 *
 * Core interfaces for the sandbox system.
 */

import { Zone, ZoneAccessMode, FileStat, BackendConfig, BackendFileStat } from './types.js';

/**
 * Main sandbox interface used by workers and tools.
 * Provides a unified API regardless of backend (CLI, browser, memory).
 */
export interface Sandbox {
  // ─────────────────────────────────────────────────────────────────────
  // File Operations
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Read file content from virtual path.
   * @throws NotFoundError if file doesn't exist
   */
  read(path: string): Promise<string>;

  /**
   * Read file as binary.
   * @throws NotFoundError if file doesn't exist
   */
  readBinary(path: string): Promise<Uint8Array>;

  /**
   * Write content to virtual path.
   * Creates parent directories if needed.
   */
  write(path: string, content: string): Promise<void>;

  /**
   * Write binary content.
   * Creates parent directories if needed.
   */
  writeBinary(path: string, content: Uint8Array): Promise<void>;

  /**
   * Delete file at virtual path.
   * @throws NotFoundError if file doesn't exist
   */
  delete(path: string): Promise<void>;

  /**
   * Check if path exists.
   */
  exists(path: string): Promise<boolean>;

  /**
   * List directory contents.
   * @throws NotFoundError if directory doesn't exist
   */
  list(path: string): Promise<string[]>;

  /**
   * Get file metadata.
   * @throws NotFoundError if file doesn't exist
   */
  stat(path: string): Promise<FileStat>;

  // ─────────────────────────────────────────────────────────────────────
  // Path Operations
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Resolve virtual path to real filesystem path.
   * Useful for passing paths to external tools.
   */
  resolve(path: string): string;

  /**
   * Get zone for a virtual path.
   * @throws InvalidPathError if path doesn't belong to a valid zone
   */
  getZone(path: string): Zone;

  /**
   * Check if path is valid (belongs to a known zone).
   */
  isValidPath(path: string): boolean;

  /**
   * Get the access mode for a zone.
   * @returns The access mode ('ro' or 'rw'), or undefined if zone doesn't exist
   */
  getZoneAccess(zoneName: string): ZoneAccessMode | undefined;

  /**
   * Get all available zone names.
   */
  getAvailableZones(): string[];
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
