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
