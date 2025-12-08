/**
 * Tests for merge operations.
 */

import { describe, it, expect } from 'vitest';
import {
  merge,
  threeWayMerge,
  generateDiff,
  generateNewFilePatch,
  generateDeleteFilePatch,
  hasConflictMarkers,
  computeDiffStats,
} from './merge.js';

describe('merge', () => {
  describe('threeWayMerge', () => {
    it('returns theirs when ours equals base', () => {
      const result = threeWayMerge('base content', 'base content', 'new content');
      expect(result.status).toBe('clean');
      expect(result.content).toBe('new content');
    });

    it('returns ours when theirs equals base', () => {
      const result = threeWayMerge('base content', 'new content', 'base content');
      expect(result.status).toBe('clean');
      expect(result.content).toBe('new content');
    });

    it('returns ours when both changed the same way', () => {
      const result = threeWayMerge('base', 'same change', 'same change');
      expect(result.status).toBe('clean');
      expect(result.content).toBe('same change');
    });

    it('detects conflicts when both changed differently', () => {
      const result = threeWayMerge(
        'line1\nline2\nline3',
        'line1\nchanged by us\nline3',
        'line1\nchanged by them\nline3'
      );
      expect(result.status).toBe('conflict');
      expect(result.content).toContain('<<<<<<< ours');
      expect(result.content).toContain('changed by us');
      expect(result.content).toContain('=======');
      expect(result.content).toContain('changed by them');
      expect(result.content).toContain('>>>>>>> theirs');
    });

    it('handles additions by us', () => {
      const result = threeWayMerge(
        'line1\nline2',
        'line1\nline2\nline3',
        'line1\nline2'
      );
      expect(result.status).toBe('clean');
      expect(result.content).toBe('line1\nline2\nline3');
    });

    it('handles additions by them', () => {
      const result = threeWayMerge(
        'line1\nline2',
        'line1\nline2',
        'line1\nline2\nline3'
      );
      expect(result.status).toBe('clean');
      expect(result.content).toBe('line1\nline2\nline3');
    });
  });

  describe('merge (two-way fallback)', () => {
    it('returns content when identical', () => {
      const result = merge('same content', 'same content');
      expect(result.status).toBe('clean');
      expect(result.content).toBe('same content');
    });

    it('uses three-way merge when base provided', () => {
      const result = merge('changed', 'base', 'base');
      expect(result.status).toBe('clean');
      expect(result.content).toBe('changed');
    });
  });

  describe('hasConflictMarkers', () => {
    it('returns true for our markers', () => {
      expect(hasConflictMarkers('<<<<<<< ours (sandbox)\nfoo')).toBe(true);
    });

    it('returns true for standard git markers', () => {
      expect(hasConflictMarkers('<<<<<<< HEAD\nfoo')).toBe(true);
    });

    it('returns false for clean content', () => {
      expect(hasConflictMarkers('just some text\nno markers here')).toBe(false);
    });
  });
});

describe('diff generation', () => {
  describe('generateDiff', () => {
    it('generates unified diff', () => {
      const diff = generateDiff('old\ncontent', 'new\ncontent');
      expect(diff).toContain('---');
      expect(diff).toContain('+++');
      expect(diff).toContain('-old');
      expect(diff).toContain('+new');
    });
  });

  describe('generateNewFilePatch', () => {
    it('generates patch for new file', () => {
      const patch = generateNewFilePatch('new content', 'test.txt');
      expect(patch).toContain('--- test.txt');
      expect(patch).toContain('+++ test.txt');
      expect(patch).toContain('+new content');
    });
  });

  describe('generateDeleteFilePatch', () => {
    it('generates patch for deleted file', () => {
      const patch = generateDeleteFilePatch('old content', 'test.txt');
      expect(patch).toContain('--- test.txt');
      expect(patch).toContain('+++ test.txt');
      expect(patch).toContain('-old content');
    });
  });
});

describe('computeDiffStats', () => {
  it('counts additions for new content', () => {
    const stats = computeDiffStats('', 'line1\nline2\nline3\n');
    expect(stats.additions).toBe(3);
    expect(stats.deletions).toBe(0);
  });

  it('counts deletions for removed content', () => {
    const stats = computeDiffStats('line1\nline2\n', '');
    expect(stats.additions).toBe(0);
    expect(stats.deletions).toBe(2);
  });

  it('counts both additions and deletions for modifications', () => {
    const stats = computeDiffStats('old line\n', 'new line\n');
    expect(stats.additions).toBe(1);
    expect(stats.deletions).toBe(1);
  });

  it('handles empty strings', () => {
    const stats = computeDiffStats('', '');
    expect(stats.additions).toBe(0);
    expect(stats.deletions).toBe(0);
  });

  it('counts empty lines (matching git behavior)', () => {
    // "a\n\nb\n" has 3 lines: "a", "", "b"
    const stats = computeDiffStats('', 'a\n\nb\n');
    expect(stats.additions).toBe(3);
  });

  it('handles content without trailing newline', () => {
    const stats = computeDiffStats('', 'single line');
    expect(stats.additions).toBe(1);
    expect(stats.deletions).toBe(0);
  });

  it('handles partial changes in multi-line content', () => {
    const stats = computeDiffStats('line1\nline2\nline3\n', 'line1\nmodified\nline3\n');
    // Only line2 changed to "modified"
    expect(stats.additions).toBe(1);
    expect(stats.deletions).toBe(1);
  });
});
