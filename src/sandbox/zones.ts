/**
 * Zone Configuration
 *
 * Permission profiles for each trust level.
 */

import { Zone, TrustLevel, ZoneConfig, ZonePermissions } from './types.js';

/**
 * Create a zone configuration.
 */
function zoneConfig(
  zone: Zone,
  opts: Omit<ZoneConfig, 'zone'>
): ZoneConfig {
  return { zone, ...opts };
}

/**
 * Permission profiles by trust level.
 *
 * Trust level hierarchy (lowest to highest):
 * - untrusted: Web content, prompt injection risk
 * - session: User-initiated single session
 * - workspace: Persistent workspace access
 * - full: Complete access (dangerous)
 */
export const PERMISSION_PROFILES: Record<TrustLevel, ZonePermissions> = {
  /**
   * UNTRUSTED: Minimal permissions for untrusted content.
   * - Can only read/write to own session
   * - Can stage new files but not overwrite
   * - Cannot access repo, workspace, or other sessions
   */
  untrusted: {
    [Zone.SESSION]: zoneConfig(Zone.SESSION, {
      readable: true,
      writable: true,
      listable: true,
      deletable: true,
      requiresApproval: false,
    }),
    [Zone.WORKSPACE]: zoneConfig(Zone.WORKSPACE, {
      readable: false,
      writable: false,
      listable: false,
      deletable: false,
      requiresApproval: false,
    }),
    [Zone.REPO]: zoneConfig(Zone.REPO, {
      readable: false,
      writable: false,
      listable: false,
      deletable: false,
      requiresApproval: false,
    }),
    [Zone.STAGED]: zoneConfig(Zone.STAGED, {
      readable: false,
      writable: true, // Can stage new files only
      listable: false,
      deletable: false,
      requiresApproval: true,
    }),
    [Zone.WORKERS]: zoneConfig(Zone.WORKERS, {
      readable: true,
      writable: false,
      listable: true,
      deletable: false,
      requiresApproval: false,
    }),
  },

  /**
   * SESSION: Standard permissions for user-initiated sessions.
   * - Full access to session and workspace
   * - Can manage staged files
   * - Cannot access repo directly
   */
  session: {
    [Zone.SESSION]: zoneConfig(Zone.SESSION, {
      readable: true,
      writable: true,
      listable: true,
      deletable: true,
      requiresApproval: false,
    }),
    [Zone.WORKSPACE]: zoneConfig(Zone.WORKSPACE, {
      readable: true,
      writable: true,
      listable: true,
      deletable: true,
      requiresApproval: false,
    }),
    [Zone.REPO]: zoneConfig(Zone.REPO, {
      readable: false,
      writable: false,
      listable: false,
      deletable: false,
      requiresApproval: false,
    }),
    [Zone.STAGED]: zoneConfig(Zone.STAGED, {
      readable: true,
      writable: true,
      listable: true,
      deletable: true,
      requiresApproval: false,
    }),
    [Zone.WORKERS]: zoneConfig(Zone.WORKERS, {
      readable: true,
      writable: false,
      listable: true,
      deletable: false,
      requiresApproval: false,
    }),
  },

  /**
   * WORKSPACE: Extended permissions for workspace-level access.
   * - Full access to session, workspace, and staged
   * - Read-only access to repo
   */
  workspace: {
    [Zone.SESSION]: zoneConfig(Zone.SESSION, {
      readable: true,
      writable: true,
      listable: true,
      deletable: true,
      requiresApproval: false,
    }),
    [Zone.WORKSPACE]: zoneConfig(Zone.WORKSPACE, {
      readable: true,
      writable: true,
      listable: true,
      deletable: true,
      requiresApproval: false,
    }),
    [Zone.REPO]: zoneConfig(Zone.REPO, {
      readable: true,
      writable: false,
      listable: true,
      deletable: false,
      requiresApproval: false,
    }),
    [Zone.STAGED]: zoneConfig(Zone.STAGED, {
      readable: true,
      writable: true,
      listable: true,
      deletable: true,
      requiresApproval: false,
    }),
    [Zone.WORKERS]: zoneConfig(Zone.WORKERS, {
      readable: true,
      writable: false,
      listable: true,
      deletable: false,
      requiresApproval: false,
    }),
  },

  /**
   * FULL: Complete access (use with caution).
   * - Full read/write to all zones including repo
   * - Can modify worker definitions
   */
  full: {
    [Zone.SESSION]: zoneConfig(Zone.SESSION, {
      readable: true,
      writable: true,
      listable: true,
      deletable: true,
      requiresApproval: false,
    }),
    [Zone.WORKSPACE]: zoneConfig(Zone.WORKSPACE, {
      readable: true,
      writable: true,
      listable: true,
      deletable: true,
      requiresApproval: false,
    }),
    [Zone.REPO]: zoneConfig(Zone.REPO, {
      readable: true,
      writable: true,
      listable: true,
      deletable: true,
      requiresApproval: false,
    }),
    [Zone.STAGED]: zoneConfig(Zone.STAGED, {
      readable: true,
      writable: true,
      listable: true,
      deletable: true,
      requiresApproval: false,
    }),
    [Zone.WORKERS]: zoneConfig(Zone.WORKERS, {
      readable: true,
      writable: true,
      listable: true,
      deletable: true,
      requiresApproval: false,
    }),
  },
};

/**
 * Get permission profile for a trust level.
 */
export function getPermissionProfile(trustLevel: TrustLevel): ZonePermissions {
  return PERMISSION_PROFILES[trustLevel];
}

/**
 * Check if a trust level dominates (is >= to) another.
 */
export function trustLevelDominates(
  higher: TrustLevel,
  lower: TrustLevel
): boolean {
  const order: TrustLevel[] = ['untrusted', 'session', 'workspace', 'full'];
  return order.indexOf(higher) >= order.indexOf(lower);
}

/**
 * Get the zone from a virtual path.
 */
export function getZoneFromPath(path: string): Zone {
  // Normalize: remove leading slash, split
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  const firstSegment = normalized.split('/')[0];

  switch (firstSegment) {
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
      throw new Error(`Unknown zone: ${firstSegment}`);
  }
}
