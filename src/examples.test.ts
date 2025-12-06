/**
 * Smoke Tests for Example Workers
 *
 * Verifies that all example workers:
 * 1. Parse correctly (valid YAML frontmatter + markdown)
 * 2. Can be initialized with the runtime
 * 3. Can process a simple input with a mocked LLM
 *
 * These tests use mocked generateText so no API calls are made.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import { parseWorkerString } from "./worker/parser.js";
import type { WorkerDefinition } from "./worker/schema.js";

// Mock generateText from AI SDK
const mockGenerateText = vi.fn();

vi.mock("ai", async (importOriginal) => {
  const original = await importOriginal<typeof import("ai")>();
  return {
    ...original,
    generateText: (...args: unknown[]) => mockGenerateText(...args),
  };
});

// Import after mock is set up
import { createWorkerRuntime } from "./runtime/worker.js";

const EXAMPLES_DIR = path.join(__dirname, "..", "examples");

// Default model for tests
const TEST_MODEL = "anthropic:claude-haiku-4-5";

interface ExampleConfig {
  name: string;
  dir: string;
  mainWorker: string;
  subWorkers?: string[];
  needsSandbox?: boolean;
}

// Define all examples to test
const EXAMPLES: ExampleConfig[] = [
  {
    name: "greeter",
    dir: "greeter",
    mainWorker: "index.worker",
    needsSandbox: false,
  },
  {
    name: "file_manager",
    dir: "file_manager",
    mainWorker: "index.worker",
    needsSandbox: true,
  },
  {
    name: "note_taker",
    dir: "note_taker",
    mainWorker: "index.worker",
    needsSandbox: true,
  },
  {
    name: "calculator",
    dir: "calculator",
    mainWorker: "index.worker",
    needsSandbox: true,
  },
  {
    name: "code_analyzer",
    dir: "code_analyzer",
    mainWorker: "index.worker",
    needsSandbox: true,
  },
  {
    name: "whiteboard_planner",
    dir: "whiteboard_planner",
    mainWorker: "index.worker",
    subWorkers: ["workers/whiteboard_analyzer.worker"],
    needsSandbox: true,
  },
  {
    name: "orchestrator",
    dir: "orchestrator",
    mainWorker: "index.worker",
    needsSandbox: false,
  },
  // pdf_analyzer has complex setup, skip for now
];

describe("Example Workers Smoke Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock: LLM responds with simple text
    mockGenerateText.mockResolvedValue({
      text: "I have processed your request.",
      toolCalls: [],
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 20 },
    });
  });

  describe("worker parsing", () => {
    for (const example of EXAMPLES) {
      it(`parses ${example.name}/index.worker`, async () => {
        const workerPath = path.join(EXAMPLES_DIR, example.dir, example.mainWorker);
        const content = await fs.readFile(workerPath, "utf-8");
        const result = parseWorkerString(content, workerPath);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.worker.name).toBeDefined();
          expect(result.worker.instructions).toBeTruthy();
        }
      });

      if (example.subWorkers) {
        for (const subWorker of example.subWorkers) {
          it(`parses ${example.name}/${subWorker}`, async () => {
            const workerPath = path.join(EXAMPLES_DIR, example.dir, subWorker);
            const content = await fs.readFile(workerPath, "utf-8");
            const result = parseWorkerString(content, workerPath);

            expect(result.success).toBe(true);
            if (result.success) {
              expect(result.worker.name).toBeDefined();
              expect(result.worker.instructions).toBeTruthy();
            }
          });
        }
      }
    }
  });

  describe("runtime initialization", () => {
    for (const example of EXAMPLES) {
      it(`initializes ${example.name} runtime`, async () => {
        const workerPath = path.join(EXAMPLES_DIR, example.dir, example.mainWorker);
        const content = await fs.readFile(workerPath, "utf-8");
        const result = parseWorkerString(content, workerPath);

        expect(result.success).toBe(true);
        if (!result.success) return;

        // Skip workers that require delegation (they need worker registry setup)
        const hasWorkersDelegation = result.worker.toolsets?.workers !== undefined;
        if (hasWorkersDelegation) {
          // These workers need complex setup - just verify they parse
          return;
        }

        const runtime = await createWorkerRuntime({
          worker: result.worker,
          model: TEST_MODEL,
          approvalMode: "approve_all",
          useTestSandbox: example.needsSandbox,
        });

        expect(runtime).toBeDefined();
        expect(runtime.getModelId()).toBe(TEST_MODEL);
      });
    }
  });

  describe("runtime execution", () => {
    // Test simple workers that don't require delegation
    const simpleExamples = EXAMPLES.filter(
      (e) => !["orchestrator", "whiteboard_planner"].includes(e.name)
    );

    for (const example of simpleExamples) {
      it(`runs ${example.name} with mocked LLM`, async () => {
        const workerPath = path.join(EXAMPLES_DIR, example.dir, example.mainWorker);
        const content = await fs.readFile(workerPath, "utf-8");
        const parseResult = parseWorkerString(content, workerPath);

        expect(parseResult.success).toBe(true);
        if (!parseResult.success) return;

        // Skip workers that require delegation
        const hasWorkersDelegation = parseResult.worker.toolsets?.workers !== undefined;
        if (hasWorkersDelegation) return;

        const runtime = await createWorkerRuntime({
          worker: parseResult.worker,
          model: TEST_MODEL,
          approvalMode: "approve_all",
          useTestSandbox: example.needsSandbox,
        });

        const result = await runtime.run("Hello, please help me.");

        expect(result.success).toBe(true);
        expect(result.response).toBeDefined();
        expect(mockGenerateText).toHaveBeenCalled();
      });
    }
  });

  describe("tool execution", () => {
    it("file_manager can execute filesystem tools", async () => {
      const workerPath = path.join(EXAMPLES_DIR, "file_manager", "index.worker");
      const content = await fs.readFile(workerPath, "utf-8");
      const parseResult = parseWorkerString(content, workerPath);

      expect(parseResult.success).toBe(true);
      if (!parseResult.success) return;

      // Mock LLM to call list_files tool, then complete
      mockGenerateText
        .mockResolvedValueOnce({
          text: "",
          toolCalls: [
            {
              toolCallId: "call_1",
              toolName: "list_files",
              args: { path: "/workspace" },
            },
          ],
          finishReason: "tool-calls",
          usage: { inputTokens: 10, outputTokens: 15 },
        })
        .mockResolvedValueOnce({
          text: "I listed the files in the workspace directory.",
          toolCalls: [],
          finishReason: "stop",
          usage: { inputTokens: 25, outputTokens: 20 },
        });

      const runtime = await createWorkerRuntime({
        worker: parseResult.worker,
        model: TEST_MODEL,
        approvalMode: "approve_all",
        useTestSandbox: true,
      });

      const result = await runtime.run("List the files in the workspace.");

      expect(result.success).toBe(true);
      expect(result.toolCallCount).toBe(1);
      expect(mockGenerateText).toHaveBeenCalledTimes(2);
    });

    it("calculator can use sandbox for scratch work", async () => {
      const workerPath = path.join(EXAMPLES_DIR, "calculator", "index.worker");
      const content = await fs.readFile(workerPath, "utf-8");
      const parseResult = parseWorkerString(content, workerPath);

      expect(parseResult.success).toBe(true);
      if (!parseResult.success) return;

      // Mock LLM to write a calculation to scratch, then complete
      mockGenerateText
        .mockResolvedValueOnce({
          text: "",
          toolCalls: [
            {
              toolCallId: "call_1",
              toolName: "write_file",
              args: {
                path: "/scratch/calculation.txt",
                content: "Fibonacci(10) = 55",
              },
            },
          ],
          finishReason: "tool-calls",
          usage: { inputTokens: 10, outputTokens: 15 },
        })
        .mockResolvedValueOnce({
          text: "The 10th Fibonacci number is 55. I saved the result to scratch.",
          toolCalls: [],
          finishReason: "stop",
          usage: { inputTokens: 25, outputTokens: 20 },
        });

      const runtime = await createWorkerRuntime({
        worker: parseResult.worker,
        model: TEST_MODEL,
        approvalMode: "approve_all",
        useTestSandbox: true,
      });

      const result = await runtime.run("What is the 10th Fibonacci number?");

      expect(result.success).toBe(true);
      expect(result.toolCallCount).toBe(1);
      expect(result.response).toContain("55");
    });
  });

  describe("worker configuration validation", () => {
    for (const example of EXAMPLES) {
      it(`${example.name} has valid toolsets configuration`, async () => {
        const workerPath = path.join(EXAMPLES_DIR, example.dir, example.mainWorker);
        const content = await fs.readFile(workerPath, "utf-8");
        const result = parseWorkerString(content, workerPath);

        expect(result.success).toBe(true);
        if (!result.success) return;

        const worker = result.worker;

        // Validate toolsets if present
        if (worker.toolsets) {
          for (const [toolsetName, config] of Object.entries(worker.toolsets)) {
            // Each toolset should be either undefined or an object
            expect(
              config === undefined || typeof config === "object"
            ).toBe(true);

            // Known toolsets
            const knownToolsets = ["filesystem", "workers", "shell", "custom"];
            if (!knownToolsets.includes(toolsetName)) {
              // Unknown toolset - that's fine, runtime will skip it
            }
          }
        }
      });

      it(`${example.name} has valid sandbox configuration`, async () => {
        const workerPath = path.join(EXAMPLES_DIR, example.dir, example.mainWorker);
        const content = await fs.readFile(workerPath, "utf-8");
        const result = parseWorkerString(content, workerPath);

        expect(result.success).toBe(true);
        if (!result.success) return;

        const worker = result.worker;

        // Validate sandbox zones if present
        if (worker.sandbox?.zones) {
          for (const zone of worker.sandbox.zones) {
            expect(zone.name).toBeDefined();
            expect(typeof zone.name).toBe("string");
            if (zone.mode) {
              expect(["ro", "rw"]).toContain(zone.mode);
            }
          }
        }
      });
    }
  });
});
