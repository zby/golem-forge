/**
 * Sandbox Types
 *
 * Core type definitions for the sandbox.
 */

/**
 * Default zones for backwards compatibility.
 * Custom zones can be defined in project config.
 */
export enum Zone {
  CACHE = 'cache',
  WORKSPACE = 'workspace',
}

/**
 * Zone access mode.
 */
export type ZoneAccessMode = 'ro' | 'rw';

/**
 * Approval decision for an operation.
 * - 'preApproved': No user prompt needed
 * - 'ask': Prompt user for approval (default)
 * - 'blocked': Operation blocked entirely
 */
export type ApprovalDecisionType = 'preApproved' | 'ask' | 'blocked';

/**
 * Per-zone approval configuration.
 * Separate from mode (capability) - this controls consent/UX.
 *
 * TODO: Consider adding shorthand `preApproved: boolean` that expands to
 * `{ write: 'preApproved', delete: 'preApproved' }` for simpler configs.
 */
export interface ZoneApprovalConfig {
  /** Approval for write operations. Default: 'ask' */
  write?: ApprovalDecisionType;
  /** Approval for delete operations. Default: 'ask' */
  delete?: ApprovalDecisionType;
}

/**
 * Zone configuration for custom zones.
 */
export interface ZoneConfig {
  /** Zone name */
  name: string;
  /** Absolute path to the zone directory */
  path: string;
  /** Access mode: ro (read-only) or rw (read-write) - capability layer */
  mode: ZoneAccessMode;
  /** Approval config - consent layer (optional, defaults to 'ask' for write ops) */
  approval?: ZoneApprovalConfig;
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
   * Defaults to 'sandbox'
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

  /**
   * Custom zone configurations.
   * Keys are zone names, values are zone configs.
   */
  zones?: Record<string, { path: string; mode: ZoneAccessMode }>;
}

/**
 * Backend configuration for initialization.
 */
export interface BackendConfig {
  mode: 'sandboxed' | 'direct';
  // Sandboxed mode
  root?: string;
  // Direct mode (legacy)
  cache?: string;
  workspace?: string;
  // Custom zones
  zones?: Record<string, { path: string; mode: ZoneAccessMode }>;
}
