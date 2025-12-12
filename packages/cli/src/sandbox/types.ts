/**
 * Sandbox Types
 *
 * Core type definitions for sandbox implementations.
 * Common types are re-exported from @golem-forge/core.
 *
 * @module sandbox/types
 */

// Re-export shared types
export type { FileStat } from '@golem-forge/core';

/**
 * Operations that can be performed on files.
 * Used for permission/approval tracking.
 */
export type Operation = 'read' | 'write' | 'delete' | 'list';

/**
 * Backend file stat (raw filesystem info).
 * Used internally by MountSandboxImpl to get stats from fs.
 */
export interface BackendFileStat {
  size: number;
  createdAt: Date;
  modifiedAt: Date;
  isDirectory: boolean;
}
