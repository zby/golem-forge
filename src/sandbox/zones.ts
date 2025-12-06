/**
 * Zone Utilities
 *
 * Helper functions for working with sandbox zones.
 */

import { Zone } from './types.js';

/**
 * Default zones for backwards compatibility.
 */
const DEFAULT_ZONES = new Set(['cache', 'workspace']);

/**
 * Allowed custom zones (dynamically populated).
 * This is a module-level set that can be updated by the sandbox implementation.
 */
let customZones: Set<string> = new Set();

/**
 * Register custom zones for validation.
 * Called by sandbox implementation when initializing with custom zones.
 */
export function registerCustomZones(zones: string[]): void {
  customZones = new Set(zones);
}

/**
 * Clear custom zones (for testing).
 */
export function clearCustomZones(): void {
  customZones.clear();
}

/**
 * Get the zone from a virtual path.
 *
 * For default zones (cache, workspace), returns the Zone enum.
 * For custom zones, returns the Zone enum based on matching or throws.
 *
 * @throws Error if path doesn't start with a valid zone
 */
export function getZoneFromPath(path: string): Zone {
  // Normalize: remove leading slash, split
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  const firstSegment = normalized.split('/')[0];

  // Check default zones
  switch (firstSegment) {
    case 'cache':
      return Zone.CACHE;
    case 'workspace':
      return Zone.WORKSPACE;
  }

  // Check custom zones - for custom zones, we return WORKSPACE as a placeholder
  // since the actual path resolution happens in the backend
  if (customZones.has(firstSegment)) {
    // Custom zones use WORKSPACE as a placeholder - the backend handles actual mapping
    return Zone.WORKSPACE;
  }

  throw new Error(
    `Unknown zone: ${firstSegment}. Valid zones are: ${getAllValidZones().join(', ')}`
  );
}

/**
 * Get zone name from a path.
 */
export function getZoneNameFromPath(path: string): string {
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  return normalized.split('/')[0];
}

/**
 * Get all valid zone names.
 */
export function getAllValidZones(): string[] {
  return [...DEFAULT_ZONES, ...customZones];
}

/**
 * Check if a path is valid (belongs to a known zone).
 */
export function isValidZonePath(path: string): boolean {
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  const firstSegment = normalized.split('/')[0];

  return DEFAULT_ZONES.has(firstSegment) || customZones.has(firstSegment);
}
