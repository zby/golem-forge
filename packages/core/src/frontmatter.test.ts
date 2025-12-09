/**
 * Tests for Frontmatter Parser
 */

import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from './frontmatter.js';

describe('parseFrontmatter', () => {
  describe('valid frontmatter', () => {
    it('extracts simple frontmatter', () => {
      const content = `---
name: test
value: 123
---

Body content here.
`;

      const result = parseFrontmatter(content);

      expect(result.data).toEqual({ name: 'test', value: 123 });
      expect(result.content).toBe('Body content here.');
    });

    it('handles nested YAML', () => {
      const content = `---
config:
  nested:
    value: deep
  array:
    - one
    - two
---

Content.
`;

      const result = parseFrontmatter(content);

      expect(result.data.config).toEqual({
        nested: { value: 'deep' },
        array: ['one', 'two'],
      });
      expect(result.content).toBe('Content.');
    });

    it('handles empty body', () => {
      const content = `---
name: empty
---
`;

      const result = parseFrontmatter(content);

      expect(result.data).toEqual({ name: 'empty' });
      expect(result.content).toBe('');
    });

    it('handles multiline body content', () => {
      const content = `---
name: multi
---

Line 1

Line 2

Line 3
`;

      const result = parseFrontmatter(content);

      expect(result.data).toEqual({ name: 'multi' });
      expect(result.content).toContain('Line 1');
      expect(result.content).toContain('Line 2');
      expect(result.content).toContain('Line 3');
    });

    it('preserves newlines in body', () => {
      const content = `---
name: test
---

First

Second
`;

      const result = parseFrontmatter(content);

      expect(result.content).toContain('\n');
    });
  });

  describe('no frontmatter', () => {
    it('returns empty data for content without frontmatter', () => {
      const content = `Just regular content
with no frontmatter.`;

      const result = parseFrontmatter(content);

      expect(result.data).toEqual({});
      expect(result.content).toBe(content.trim());
    });

    it('handles content starting with --- but not valid frontmatter', () => {
      const content = `---
not valid because no closing`;

      const result = parseFrontmatter(content);

      expect(result.data).toEqual({});
    });

    it('handles empty content', () => {
      const result = parseFrontmatter('');

      expect(result.data).toEqual({});
      expect(result.content).toBe('');
    });

    it('handles whitespace only content', () => {
      const result = parseFrontmatter('   \n   \n   ');

      expect(result.data).toEqual({});
      expect(result.content).toBe('');
    });
  });

  describe('edge cases', () => {
    it('handles unicode in frontmatter', () => {
      const content = `---
name: 测试
emoji: "🎉"
---

Unicode body 世界
`;

      const result = parseFrontmatter(content);

      expect(result.data.name).toBe('测试');
      expect(result.data.emoji).toBe('🎉');
      expect(result.content).toContain('世界');
    });

    it('handles Windows line endings', () => {
      const content = `---\r\nname: windows\r\n---\r\n\r\nContent here.\r\n`;

      const result = parseFrontmatter(content);

      expect(result.data).toEqual({ name: 'windows' });
      expect(result.content).toBe('Content here.');
    });

    it('handles tabs in delimiter line', () => {
      const content = `---\t
name: tabs
---\t

Content.
`;

      const result = parseFrontmatter(content);

      expect(result.data).toEqual({ name: 'tabs' });
      expect(result.content).toBe('Content.');
    });

    it('handles empty YAML section', () => {
      const content = `---
---

Just body.
`;

      const result = parseFrontmatter(content);

      expect(result.data).toEqual({});
      expect(result.content).toBe('Just body.');
    });

    it('preserves --- in body content', () => {
      const content = `---
name: test
---

Some content with --- in it.

And more --- here.
`;

      const result = parseFrontmatter(content);

      expect(result.data).toEqual({ name: 'test' });
      expect(result.content).toContain('---');
    });
  });
});
