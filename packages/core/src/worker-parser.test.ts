/**
 * Tests for Worker Parser
 */

import { describe, it, expect } from 'vitest';
import { parseWorkerString } from './worker-parser.js';
import { formatParseError } from './worker-schema.js';

describe('parseWorkerString', () => {
  describe('valid workers', () => {
    it('parses a minimal worker', () => {
      const content = `---
name: greeter
description: A friendly greeter
---

You are a friendly assistant.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.name).toBe('greeter');
        expect(result.worker.description).toBe('A friendly greeter');
        expect(result.worker.instructions).toBe('You are a friendly assistant.');
      }
    });

    it('parses worker with sandbox config', () => {
      const content = `---
name: file_writer
description: Writes files to sandbox
sandbox:
  restrict: /src
  readonly: true
---

You write files to the sandbox.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.sandbox).toBeDefined();
        expect(result.worker.sandbox?.restrict).toBe('/src');
        expect(result.worker.sandbox?.readonly).toBe(true);
      }
    });

    it('parses worker with toolsets', () => {
      const content = `---
name: orchestrator
description: Orchestrates other workers
toolsets:
  delegation:
    allow_workers:
      - worker_a
      - worker_b
  filesystem: {}
---

You orchestrate tasks.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.toolsets?.delegation).toBeDefined();
        expect(result.worker.toolsets?.filesystem).toBeDefined();
      }
    });

    it('parses worker with compatible_models specification', () => {
      const content = `---
name: fast_worker
description: Uses Anthropic or OpenAI
compatible_models:
  - "anthropic:*"
  - "openai:gpt-4o-mini"
---

You respond quickly.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.compatible_models).toContain('anthropic:*');
        expect(result.worker.compatible_models).toContain('openai:gpt-4o-mini');
      }
    });

    it('parses worker with attachment policy', () => {
      const content = `---
name: doc_processor
description: Processes documents
attachment_policy:
  max_attachments: 10
  max_total_bytes: 50000000
  allowed_suffixes:
    - .pdf
    - .docx
---

You process documents.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.attachment_policy?.max_attachments).toBe(10);
        expect(result.worker.attachment_policy?.allowed_suffixes).toContain('.pdf');
      }
    });

    it('handles multiline instructions', () => {
      const content = `---
name: multi_step
description: Multi-step worker
---

Step 1: Analyze the input
Step 2: Process the data
Step 3: Return results

Remember to:
- Be thorough
- Be accurate
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.instructions).toContain('Step 1');
        expect(result.worker.instructions).toContain('Be thorough');
      }
    });
  });

  describe('invalid workers', () => {
    it('rejects worker without name', () => {
      const content = `---
description: Missing name
---

Instructions here.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid');
        expect(result.details?.issues.some((i) => i.path.includes('name'))).toBe(true);
      }
    });

    it('rejects worker with invalid sandbox mode', () => {
      const content = `---
name: bad_sandbox
sandbox:
  zones:
    - name: workspace
      mode: invalid_mode
---

Instructions.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid');
      }
    });

    it('rejects worker with invalid zone config', () => {
      const content = `---
name: bad_zone
sandbox:
  zones:
    - invalid: config
---

Instructions.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(false);
    });

    it('handles malformed YAML gracefully', () => {
      const content = `---
name: bad_yaml
toolsets: [this is not valid yaml
---

Instructions.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(false);
    });

    it('rejects worker with unknown fields (strict validation)', () => {
      const content = `---
name: unknown_fields
description: Has unknown fields
unknown_field: should_fail
another_typo: also_bad
---

Instructions.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid');
      }
    });

    it('rejects sandbox zone with unknown fields', () => {
      const content = `---
name: bad_zone_fields
sandbox:
  zones:
    - name: workspace
      mode: rw
      typo_field: oops
---

Instructions.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('handles empty instructions', () => {
      const content = `---
name: empty_body
description: Has empty instructions
---
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.instructions).toBe('');
      }
    });

    it('preserves newlines in instructions', () => {
      const content = `---
name: whitespace_test
---

First line

Second line
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.instructions).toContain('First line');
        expect(result.worker.instructions).toContain('Second line');
        expect(result.worker.instructions).toContain('\n');
      }
    });

    it('handles unicode in instructions', () => {
      const content = `---
name: unicode_test
---

Hello 世界! Привет мир!
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.instructions).toContain('世界');
      }
    });

    it('includes file path in error context', () => {
      const content = `---
description: Missing name
---

Instructions.
`;

      const result = parseWorkerString(content, '/path/to/worker.worker');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('/path/to/worker.worker');
      }
    });
  });
});

describe('formatParseError', () => {
  it('formats error with details', () => {
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

  it('returns no error for success', () => {
    const content = `---
name: valid
---
Test
`;

    const result = parseWorkerString(content);
    const formatted = formatParseError(result);

    expect(formatted).toBe('No error');
  });
});
