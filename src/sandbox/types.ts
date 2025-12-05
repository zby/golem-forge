/**
 * Sandbox Types
 *
 * Core type definitions for the simplified sandbox.
 */

/**
 * Zones divide the virtual filesystem into areas.
 * - cache: External downloads (PDFs, web pages)
 * - workspace: Working files (reports, outputs)
 */
export enum Zone {
  CACHE = 'cache',
  WORKSPACE = 'workspace',
}

/**
 * Operations that can be performed on files.
 */
export type Operation = 'read' | 'write' | 'delete' | 'list';

/**
 * File metadata.
 */
export interface FileStat {
  path: string;
  size: number;
  createdAt: Date;
  modifiedAt: Date;
  isDirectory: boolean;
}

/**
 * Backend file stat (raw filesystem info).
 */
export interface BackendFileStat {
  size: number;
  createdAt: Date;
  modifiedAt: Date;
  isDirectory: boolean;
}

/**
 * Sandbox configuration.
 */
export interface SandboxConfig {
  /**
   * Mode determines how virtual paths map to real paths.
   * - 'sandboxed': All files in a single root directory
   * - 'direct': Zones map to user-specified directories
   */
  mode: 'sandboxed' | 'direct';

  /**
   * Sandboxed mode: Root directory for all sandbox files.
   * Defaults to '.sandbox'
   */
  root?: string;

  /**
   * Direct mode: Directory for /cache/ zone.
   * e.g., './downloads'
   */
  cache?: string;

  /**
   * Direct mode: Directory for /workspace/ zone.
   * e.g., './reports'
   */
  workspace?: string;
}

/**
 * Backend configuration for initialization.
 */
export interface BackendConfig {
  mode: 'sandboxed' | 'direct';
  // Sandboxed mode
  root?: string;
  // Direct mode
  cache?: string;
  workspace?: string;
}
