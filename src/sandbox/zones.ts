/**
 * Zone Utilities
 *
 * Helper functions for working with sandbox zones.
 */

import { Zone } from './types.js';

/**
 * Get the zone from a virtual path.
 *
 * @throws Error if path doesn't start with a valid zone
 */
export function getZoneFromPath(path: string): Zone {
  // Normalize: remove leading slash, split
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  const firstSegment = normalized.split('/')[0];

  switch (firstSegment) {
    case 'cache':
      return Zone.CACHE;
    case 'workspace':
      return Zone.WORKSPACE;
    default:
      throw new Error(`Unknown zone: ${firstSegment}. Valid zones are: cache, workspace`);
  }
}

/**
 * Check if a path is valid (belongs to a known zone).
 */
export function isValidZonePath(path: string): boolean {
  try {
    getZoneFromPath(path);
    return true;
  } catch {
    return false;
  }
}
