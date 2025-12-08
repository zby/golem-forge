/**
 * Sandbox Types
 *
 * Core type definitions shared by sandbox implementations.
 */

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
