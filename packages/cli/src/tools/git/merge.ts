/**
 * Three-Way Merge
 *
 * Implements three-way merge with conflict markers.
 * Uses the diff library for generating diffs.
 */

import { diffLines, createTwoFilesPatch, createPatch } from 'diff';
import type { MergeResult } from './types.js';

/**
 * Markers for merge conflicts.
 */
const CONFLICT_MARKERS = {
  ours: '<<<<<<< ours (sandbox)',
  separator: '=======',
  theirs: '>>>>>>> theirs (incoming)',
};

/**
 * Perform a two-way merge (without base).
 * Simply combines both versions with conflict markers when they differ.
 */
function twoWayMerge(ours: string, theirs: string): MergeResult {

  // If identical, no merge needed
  if (ours === theirs) {
    return { status: 'clean', content: ours };
  }

  // Use diff to find changes
  const changes = diffLines(ours, theirs);

  const result: string[] = [];
  let hasConflict = false;

  for (const change of changes) {
    if (change.added) {
      // Only in theirs - potential conflict
      if (result.length > 0 && result[result.length - 1] !== CONFLICT_MARKERS.separator) {
        // Check if previous was removed (our content)
        // This is a conflict
        hasConflict = true;
        result.push(CONFLICT_MARKERS.separator);
      }
      result.push(change.value.replace(/\n$/, ''));
      if (hasConflict) {
        result.push(CONFLICT_MARKERS.theirs);
        hasConflict = false;
      }
    } else if (change.removed) {
      // Only in ours - start conflict marker
      hasConflict = true;
      result.push(CONFLICT_MARKERS.ours);
      result.push(change.value.replace(/\n$/, ''));
    } else {
      // In both - clean
      result.push(change.value.replace(/\n$/, ''));
    }
  }

  const content = result.join('\n');
  const hasConflictMarkers = content.includes(CONFLICT_MARKERS.ours);

  return {
    status: hasConflictMarkers ? 'conflict' : 'clean',
    content,
  };
}

/**
 * Perform a three-way merge.
 *
 * Uses the base (common ancestor) to determine which changes to keep:
 * - If only one side changed from base, take that change
 * - If both sides changed the same way, take the common change
 * - If both sides changed differently, mark as conflict
 *
 * @param base - Common ancestor content
 * @param ours - Local/sandbox version
 * @param theirs - Incoming version
 * @returns Merge result with status and content
 */
export function threeWayMerge(base: string, ours: string, theirs: string): MergeResult {
  // If ours or theirs is same as base, just take the other
  if (ours === base) {
    return { status: 'clean', content: theirs };
  }
  if (theirs === base) {
    return { status: 'clean', content: ours };
  }

  // If ours equals theirs, both made the same change
  if (ours === theirs) {
    return { status: 'clean', content: ours };
  }

  // Need to do actual merge
  const baseLines = base.split('\n');
  const oursLines = ours.split('\n');
  const theirsLines = theirs.split('\n');

  // Simple line-by-line merge
  // For each line position, determine what to include
  const maxLines = Math.max(baseLines.length, oursLines.length, theirsLines.length);
  const result: string[] = [];
  let hasConflict = false;
  let inConflict = false;

  for (let i = 0; i < maxLines; i++) {
    const baseLine = baseLines[i];
    const ourLine = oursLines[i];
    const theirLine = theirsLines[i];

    // Both undefined (past end of all files)
    if (ourLine === undefined && theirLine === undefined) {
      continue;
    }

    // Only in ours (we added, or they deleted)
    if (theirLine === undefined && ourLine !== undefined) {
      if (baseLine === undefined) {
        // We added this line
        result.push(ourLine);
      } else {
        // They deleted, we kept - conflict
        if (!inConflict) {
          result.push(CONFLICT_MARKERS.ours);
          inConflict = true;
          hasConflict = true;
        }
        result.push(ourLine);
      }
      continue;
    }

    // Only in theirs (they added, or we deleted)
    if (ourLine === undefined && theirLine !== undefined) {
      if (baseLine === undefined) {
        // They added this line
        if (inConflict) {
          result.push(CONFLICT_MARKERS.separator);
          result.push(theirLine);
          result.push(CONFLICT_MARKERS.theirs);
          inConflict = false;
        } else {
          result.push(theirLine);
        }
      } else {
        // We deleted, they kept - conflict
        if (inConflict) {
          result.push(CONFLICT_MARKERS.separator);
        } else {
          result.push(CONFLICT_MARKERS.ours);
          hasConflict = true;
        }
        result.push(CONFLICT_MARKERS.separator);
        result.push(theirLine);
        result.push(CONFLICT_MARKERS.theirs);
        inConflict = false;
      }
      continue;
    }

    // End any open conflict block
    if (inConflict && ourLine === theirLine) {
      result.push(CONFLICT_MARKERS.separator);
      result.push(CONFLICT_MARKERS.theirs);
      inConflict = false;
    }

    // Both present
    if (ourLine === theirLine) {
      // Same content - easy
      result.push(ourLine);
    } else if (ourLine === baseLine) {
      // We didn't change, they did - take theirs
      result.push(theirLine);
    } else if (theirLine === baseLine) {
      // They didn't change, we did - take ours
      result.push(ourLine);
    } else {
      // Both changed differently - conflict
      if (!inConflict) {
        result.push(CONFLICT_MARKERS.ours);
        inConflict = true;
        hasConflict = true;
      }
      result.push(ourLine);
      result.push(CONFLICT_MARKERS.separator);
      result.push(theirLine);
      result.push(CONFLICT_MARKERS.theirs);
      inConflict = false;
    }
  }

  // Close any remaining conflict block
  if (inConflict) {
    result.push(CONFLICT_MARKERS.separator);
    result.push(CONFLICT_MARKERS.theirs);
  }

  return {
    status: hasConflict ? 'conflict' : 'clean',
    content: result.join('\n'),
  };
}

/**
 * Merge two versions with optional base.
 *
 * @param ours - Local/sandbox version
 * @param theirs - Incoming version
 * @param base - Optional common ancestor
 * @returns Merge result
 */
export function merge(ours: string, theirs: string, base?: string): MergeResult {
  if (base !== undefined) {
    return threeWayMerge(base, ours, theirs);
  }
  return twoWayMerge(ours, theirs);
}

/**
 * Generate a unified diff between two strings.
 *
 * @param oldStr - Original content
 * @param newStr - New content
 * @param oldPath - Path for old file (display only)
 * @param newPath - Path for new file (display only)
 * @returns Unified diff string
 */
export function generateDiff(
  oldStr: string,
  newStr: string,
  oldPath: string = 'a',
  newPath: string = 'b'
): string {
  return createTwoFilesPatch(oldPath, newPath, oldStr, newStr);
}

/**
 * Generate a patch for a new file.
 *
 * @param content - File content
 * @param path - File path
 * @returns Patch string
 */
export function generateNewFilePatch(content: string, path: string): string {
  return createPatch(path, '', content);
}

/**
 * Generate a patch for a deleted file.
 *
 * @param content - Original file content
 * @param path - File path
 * @returns Patch string
 */
export function generateDeleteFilePatch(content: string, path: string): string {
  return createPatch(path, content, '');
}

/**
 * Check if content has conflict markers.
 *
 * @param content - File content to check
 * @returns true if conflict markers found
 */
export function hasConflictMarkers(content: string): boolean {
  return (
    content.includes(CONFLICT_MARKERS.ours) ||
    content.includes('<<<<<<< ') // Also catch standard git markers
  );
}

/**
 * Statistics for a diff.
 */
export interface DiffStats {
  /** Number of lines added */
  additions: number;
  /** Number of lines removed */
  deletions: number;
}

/**
 * Compute diff statistics between two strings.
 *
 * Counts all lines including empty ones, matching git's behavior.
 * Note: A trailing newline does not count as an extra line.
 *
 * @param oldStr - Original content (empty string for new files)
 * @param newStr - New content (empty string for deleted files)
 * @returns Statistics with addition and deletion counts
 */
export function computeDiffStats(oldStr: string, newStr: string): DiffStats {
  const changes = diffLines(oldStr, newStr);

  let additions = 0;
  let deletions = 0;

  for (const change of changes) {
    // Count all lines (matching git behavior).
    // split('\n') on "a\nb\n" gives ["a", "b", ""] - the trailing empty is from the newline.
    // We want to count actual lines, so if last element is empty (trailing newline), don't count it.
    const parts = change.value.split('\n');
    const lineCount = parts[parts.length - 1] === '' ? parts.length - 1 : parts.length;

    if (change.added) {
      additions += lineCount;
    } else if (change.removed) {
      deletions += lineCount;
    }
  }

  return { additions, deletions };
}
