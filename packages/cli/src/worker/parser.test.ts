/**
 * Tests for Worker Parser (CLI re-export)
 *
 * Core parsing tests are in @golem-forge/core.
 * These tests verify the re-export works correctly.
 */

import { describe, it, expect } from 'vitest';
import { parseWorkerString, formatParseError } from './parser.js';

describe('parseWorkerString (re-exported from core)', () => {
  it('parses a valid worker', () => {
    const content = `---
name: test
---

Instructions.
`;

    const result = parseWorkerString(content);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.worker.name).toBe('test');
      expect(result.worker.instructions).toBe('Instructions.');
    }
  });

  it('returns error for invalid worker', () => {
    const content = `---
description: Missing name
---

Instructions.
`;

    const result = parseWorkerString(content);

    expect(result.success).toBe(false);
  });
});

describe('formatParseError (re-exported from core)', () => {
  it('formats errors correctly', () => {
    const content = `---
description: Missing name
---
Test
`;

    const result = parseWorkerString(content);
    const formatted = formatParseError(result);

    expect(formatted).toContain('Invalid');
    expect(formatted).toContain('name');
  });
});
