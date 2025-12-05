import { describe, it, expect } from "vitest";
import { parseWorkerString, formatParseError } from "./parser.js";

describe("parseWorkerString", () => {
  describe("valid workers", () => {
    it("parses a minimal worker", () => {
      const content = `---
name: greeter
description: A friendly greeter
---

You are a friendly assistant.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.name).toBe("greeter");
        expect(result.worker.description).toBe("A friendly greeter");
        expect(result.worker.instructions).toBe("You are a friendly assistant.");
      }
    });

    it("parses worker with sandbox config", () => {
      const content = `---
name: file_writer
description: Writes files to sandbox
sandbox:
  paths:
    output:
      root: ./output
      mode: rw
      suffixes:
        - .txt
        - .md
      max_file_bytes: 100000
      write_approval: true
---

You write files to the output sandbox.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.sandbox?.paths?.output).toBeDefined();
        expect(result.worker.sandbox?.paths?.output.mode).toBe("rw");
        expect(result.worker.sandbox?.paths?.output.suffixes).toEqual([".txt", ".md"]);
        expect(result.worker.sandbox?.paths?.output.write_approval).toBe(true);
      }
    });

    it("parses worker with toolsets", () => {
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

    it("parses worker with model specification", () => {
      const content = `---
name: fast_worker
description: Uses a fast model
model: anthropic:claude-haiku-4-5
compatible_models:
  - "anthropic:*"
  - "openai:gpt-4o-mini"
---

You respond quickly.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.model).toBe("anthropic:claude-haiku-4-5");
        expect(result.worker.compatible_models).toContain("anthropic:*");
      }
    });

    it("parses worker with attachment policy", () => {
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
        expect(result.worker.attachment_policy?.allowed_suffixes).toContain(".pdf");
      }
    });

    it("handles multiline instructions", () => {
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
        expect(result.worker.instructions).toContain("Step 1");
        expect(result.worker.instructions).toContain("Be thorough");
      }
    });
  });

  describe("invalid workers", () => {
    it("rejects worker without name", () => {
      const content = `---
description: Missing name
---

Instructions here.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Invalid");
        expect(result.details?.issues.some((i) => i.path.includes("name"))).toBe(true);
      }
    });

    it("rejects worker with invalid sandbox mode", () => {
      const content = `---
name: bad_sandbox
sandbox:
  paths:
    output:
      root: ./output
      mode: invalid_mode
---

Instructions.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Invalid");
      }
    });

    it("rejects worker with negative max_file_bytes", () => {
      const content = `---
name: bad_bytes
sandbox:
  paths:
    output:
      root: ./output
      max_file_bytes: -100
---

Instructions.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(false);
    });

    it("handles malformed YAML gracefully", () => {
      const content = `---
name: bad_yaml
toolsets: [this is not valid yaml
---

Instructions.
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("handles empty instructions", () => {
      const content = `---
name: empty_body
description: Has empty instructions
---
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.instructions).toBe("");
      }
    });

    it("preserves newlines in instructions", () => {
      const content = `---
name: whitespace_test
---

First line

Second line
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.instructions).toContain("First line");
        expect(result.worker.instructions).toContain("Second line");
        // Gray-matter normalizes leading whitespace but preserves newlines
        expect(result.worker.instructions).toContain("\n");
      }
    });

    it("handles unicode in instructions", () => {
      const content = `---
name: unicode_test
---

Hello 世界! 🎉 Привет мир!
`;

      const result = parseWorkerString(content);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.worker.instructions).toContain("世界");
        expect(result.worker.instructions).toContain("🎉");
      }
    });
  });
});

describe("formatParseError", () => {
  it("formats error with details", () => {
    const content = `---
description: Missing name
---
Test
`;

    const result = parseWorkerString(content);
    const formatted = formatParseError(result);

    expect(formatted).toContain("Invalid");
    expect(formatted).toContain("name");
  });

  it("returns no error for success", () => {
    const content = `---
name: valid
---
Test
`;

    const result = parseWorkerString(content);
    const formatted = formatParseError(result);

    expect(formatted).toBe("No error");
  });
});
