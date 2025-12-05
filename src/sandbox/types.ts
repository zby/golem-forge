/**
 * Sandbox Types
 *
 * Core type definitions for the zone-based sandbox security model.
 */

/**
 * Zones divide the virtual filesystem into areas with different security characteristics.
 */
export enum Zone {
  SESSION = 'session',
  WORKSPACE = 'workspace',
  REPO = 'repo',
  STAGED = 'staged',
  WORKERS = 'workers',
}

/**
 * Trust levels determine what operations are permitted.
 * - untrusted: Web content, prompt injection risk
 * - session: User-initiated single session
 * - workspace: Persistent workspace access
 * - full: Complete access (dangerous)
 */
export type TrustLevel = 'untrusted' | 'session' | 'workspace' | 'full';

/**
 * Operations that can be performed on files.
 */
export type Operation = 'read' | 'write' | 'delete' | 'list';

/**
 * Source context describes where a request originated.
 */
export interface SourceContext {
  type: 'cli' | 'browser_action' | 'web_content' | 'api';
  origin?: string;
  userInitiated: boolean;
}

/**
 * Session represents an active sandbox session.
 */
export interface Session {
  id: string;
  workspaceId: string;
  createdAt: Date;
  trustLevel: TrustLevel;
  sourceContext: SourceContext;
}

/**
 * Configuration for a zone's permissions.
 */
export interface ZoneConfig {
  zone: Zone;
  readable: boolean;
  writable: boolean;
  listable: boolean;
  deletable: boolean;
  requiresApproval: boolean;
}

/**
 * Zone permissions map for a security context.
 */
export type ZonePermissions = {
  [K in Zone]: ZoneConfig;
};

/**
 * Security context encapsulates all permission information.
 */
export interface SecurityContext {
  trustLevel: TrustLevel;
  sessionId: string;
  origin: string | null;
  permissions: ZonePermissions;
}

/**
 * Result of a permission check.
 */
export interface PermissionCheck {
  allowed: boolean;
  reason?: string;
  zone: Zone;
  trustLevel: TrustLevel;
}

/**
 * File metadata.
 */
export interface FileStat {
  path: string;
  zone: Zone;
  size: number;
  createdAt: Date;
  modifiedAt: Date;
  isDirectory: boolean;
}

/**
 * Request to stage a file for commit.
 */
export interface StageRequest {
  /** Target path in repo (relative to repo root) */
  repoPath: string;
  /** Content to stage */
  content: string;
  /** Commit message for this file (optional, can be grouped) */
  message?: string;
}

/**
 * A file within a staged commit.
 */
export interface StagedFile {
  repoPath: string;
  operation: 'create' | 'update' | 'delete';
  size: number;
  hash: string;
}

/**
 * A staged commit pending approval.
 */
export interface StagedCommit {
  id: string;
  sessionId: string;
  createdAt: Date;
  message: string;
  files: StagedFile[];
  status: 'pending' | 'approved' | 'committed' | 'rejected';
}

/**
 * Backend file stat (raw filesystem info without zone).
 */
export interface BackendFileStat {
  size: number;
  createdAt: Date;
  modifiedAt: Date;
  isDirectory: boolean;
}

/**
 * Backend configuration for initialization.
 */
export interface BackendConfig {
  workspaceId: string;
  sessionId: string;
  // CLI-specific
  projectRoot?: string;
  sandboxDir?: string;
  // Browser-specific
  opfsRoot?: FileSystemDirectoryHandle;
}
