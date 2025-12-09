/**
 * Worker Manager Tests
 *
 * Tests for the browser-compatible YAML frontmatter parser and worker parsing.
 */

import { describe, it, expect } from 'vitest';
import { parseWorkerString } from './worker-manager';

describe('parseWorkerString', () => {
  describe('basic worker parsing', () => {
    it('parses a simple worker with name and description', () => {
      const content = `---
name: simple-greeter
description: A friendly assistant that greets users
---

You are a friendly and helpful assistant. Greet the user warmly.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.name).toBe('simple-greeter');
        expect(result.worker.description).toBe('A friendly assistant that greets users');
        expect(result.worker.instructions).toBe('You are a friendly and helpful assistant. Greet the user warmly.');
      }
    });

    it('parses a worker with no description', () => {
      const content = `---
name: minimal-worker
---

Instructions here.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.name).toBe('minimal-worker');
        expect(result.worker.description).toBeUndefined();
        expect(result.worker.instructions).toBe('Instructions here.');
      }
    });
  });

  describe('toolsets parsing', () => {
    it('parses a worker with filesystem toolset', () => {
      const content = `---
name: code-reviewer
description: Reviews code snippets
toolsets:
  filesystem: {}
---

You are a code reviewer.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.name).toBe('code-reviewer');
        expect(result.worker.toolsets).toBeDefined();
        expect(result.worker.toolsets?.filesystem).toEqual({});
      }
    });

    it('parses a worker with multiple toolsets', () => {
      const content = `---
name: multi-tool-worker
toolsets:
  filesystem: {}
  git: {}
---

Instructions.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.toolsets?.filesystem).toEqual({});
        expect(result.worker.toolsets?.git).toEqual({});
      }
    });
  });

  describe('sandbox configuration parsing', () => {
    it('parses sandbox with restrict and readonly', () => {
      const content = `---
name: restricted-worker
sandbox:
  restrict: /input
  readonly: true
---

Instructions.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.sandbox?.restrict).toBe('/input');
        expect(result.worker.sandbox?.readonly).toBe(true);
      }
    });

    it('parses sandbox with approval config', () => {
      const content = `---
name: approval-worker
sandbox:
  approval:
    write: preApproved
    delete: ask
---

Instructions.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.sandbox?.approval?.write).toBe('preApproved');
        expect(result.worker.sandbox?.approval?.delete).toBe('ask');
      }
    });
  });

  describe('compatible_models parsing', () => {
    it('parses compatible_models array', () => {
      const content = `---
name: model-specific-worker
compatible_models:
  - "anthropic:*"
  - "openai:gpt-4*"
---

Instructions.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.compatible_models).toEqual([
          'anthropic:*',
          'openai:gpt-4*',
        ]);
      }
    });
  });

  describe('attachment_policy parsing', () => {
    it('parses attachment policy', () => {
      const content = `---
name: attachment-worker
attachment_policy:
  max_attachments: 10
  max_total_bytes: 50000000
  allowed_suffixes:
    - .pdf
    - .png
---

Instructions.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.attachment_policy?.max_attachments).toBe(10);
        expect(result.worker.attachment_policy?.max_total_bytes).toBe(50000000);
        expect(result.worker.attachment_policy?.allowed_suffixes).toEqual(['.pdf', '.png']);
      }
    });
  });

  describe('boolean and number parsing', () => {
    it('parses boolean values correctly', () => {
      const content = `---
name: bool-worker
locked: true
sandbox:
  readonly: false
---

Instructions.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.locked).toBe(true);
        expect(result.worker.sandbox?.readonly).toBe(false);
      }
    });

    it('parses number values correctly', () => {
      const content = `---
name: number-worker
attachment_policy:
  max_attachments: 5
  max_total_bytes: 1000000
---

Instructions.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.attachment_policy?.max_attachments).toBe(5);
        expect(result.worker.attachment_policy?.max_total_bytes).toBe(1000000);
      }
    });
  });

  describe('complex worker parsing', () => {
    it('parses a full-featured worker definition', () => {
      const content = `---
name: pitch-deck-analyzer
description: Analyzes pitch deck presentations and provides structured feedback
compatible_models:
  - "anthropic:*"
  - "openai:gpt-4*"
toolsets:
  filesystem: {}
sandbox:
  restrict: /input
  readonly: true
attachment_policy:
  max_attachments: 10
  max_total_bytes: 50000000
  allowed_suffixes:
    - .pdf
    - .pptx
    - .png
locked: false
---

You are a pitch deck analyzer. Your job is to review startup pitch decks and provide structured feedback.

**Analysis Framework:**

1. **Problem Statement**
   - Is the problem clearly defined?
   - Is there evidence the problem is significant?

2. **Solution**
   - Is the solution clearly explained?
   - Does it directly address the stated problem?
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.name).toBe('pitch-deck-analyzer');
        expect(result.worker.description).toBe('Analyzes pitch deck presentations and provides structured feedback');
        expect(result.worker.compatible_models).toEqual(['anthropic:*', 'openai:gpt-4*']);
        expect(result.worker.toolsets?.filesystem).toEqual({});
        expect(result.worker.sandbox?.restrict).toBe('/input');
        expect(result.worker.sandbox?.readonly).toBe(true);
        expect(result.worker.attachment_policy?.max_attachments).toBe(10);
        expect(result.worker.attachment_policy?.allowed_suffixes).toContain('.pdf');
        expect(result.worker.locked).toBe(false);
        expect(result.worker.instructions).toContain('pitch deck analyzer');
        expect(result.worker.instructions).toContain('Analysis Framework');
      }
    });
  });

  describe('error handling', () => {
    it('fails when name is missing', () => {
      const content = `---
description: A worker without a name
---

Instructions.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid worker definition');
      }
    });

    it('fails when sandbox restrict path is invalid', () => {
      const content = `---
name: invalid-sandbox
sandbox:
  restrict: relative/path
---

Instructions.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid worker definition');
      }
    });

    it('handles content without frontmatter', () => {
      const content = `Just some instructions without frontmatter.`;

      const result = parseWorkerString(content);

      // Should fail because name is required
      expect(result.success).toBe(false);
    });
  });

  describe('multiline instructions', () => {
    it('preserves multiline instructions correctly', () => {
      const content = `---
name: multiline-worker
---

Line 1
Line 2

Line 4 after blank line

* Bullet 1
* Bullet 2
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.instructions).toContain('Line 1');
        expect(result.worker.instructions).toContain('Line 2');
        expect(result.worker.instructions).toContain('Line 4 after blank line');
        expect(result.worker.instructions).toContain('* Bullet 1');
      }
    });
  });

  describe('quoted string values', () => {
    it('handles double-quoted strings', () => {
      const content = `---
name: "quoted-worker"
description: "A description with: colons"
---

Instructions.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.name).toBe('quoted-worker');
        expect(result.worker.description).toBe('A description with: colons');
      }
    });

    it('handles single-quoted strings', () => {
      const content = `---
name: 'single-quoted'
description: 'Description here'
---

Instructions.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.name).toBe('single-quoted');
        expect(result.worker.description).toBe('Description here');
      }
    });
  });
});
