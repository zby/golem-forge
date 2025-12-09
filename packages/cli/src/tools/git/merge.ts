/**
 * Three-Way Merge
 *
 * Re-exports merge utilities from @golem-forge/core.
 * The implementation is platform-agnostic and works in both Node.js and browser.
 */

export {
  merge,
  threeWayMerge,
  generateDiff,
  generateNewFilePatch,
  generateDeleteFilePatch,
  hasConflictMarkers,
  computeDiffStats,
  type DiffStats,
} from '@golem-forge/core';

// Re-export MergeResult type from local types for backwards compatibility
export type { MergeResult } from './types.js';
