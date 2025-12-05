/**
 * Tests for Worker Execution Runtime
 *
 * Note: These tests focus on configuration and initialization.
 * Full integration tests with LLM calls would require mock servers
 * or use the real API (covered by manual/e2e tests).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WorkerDefinition } from "../worker/schema.js";

// Create mock client before mock setup
const mockAskFn = vi.fn();
const mockClient = {
  ask: mockAskFn,
  getModel: () => "mock-model",
  getProvider: () => "mock-provider",
};

// Mock the lemmy module
vi.mock("@mariozechner/lemmy", async (importOriginal) => {
  const original = await importOriginal<typeof import("@mariozechner/lemmy")>();
  return {
    ...original,
    lemmy: {
      anthropic: () => mockClient,
      openai: () => mockClient,
      google: () => mockClient,
    },
  };
});

// Import after mock is set up
import { WorkerRuntime, createWorkerRuntime } from "./worker.js";

describe("WorkerRuntime", () => {
  const simpleWorker: WorkerDefinition = {
    name: "test-worker",
    instructions: "You are a helpful assistant.",
    description: "A test worker",
  };

  const workerWithFilesystem: WorkerDefinition = {
    name: "fs-worker",
    instructions: "You can read and write files.",
    toolsets: {
      filesystem: {},
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("creates runtime with worker definition", () => {
      const runtime = new WorkerRuntime({
        worker: simpleWorker,
      });

      expect(runtime).toBeInstanceOf(WorkerRuntime);
    });

    it("sets system message from worker instructions", () => {
      const runtime = new WorkerRuntime({
        worker: simpleWorker,
      });

      const context = runtime.getContext();
      expect(context.getSystemMessage()).toBe("You are a helpful assistant.");
    });
  });

  describe("initialize", () => {
    it("creates test sandbox when useTestSandbox is true", async () => {
      const runtime = new WorkerRuntime({
        worker: workerWithFilesystem,
        useTestSandbox: true,
      });

      await runtime.initialize();

      expect(runtime.getSandbox()).toBeDefined();
    });

    it("registers filesystem tools when toolset is configured", async () => {
      const runtime = new WorkerRuntime({
        worker: workerWithFilesystem,
        useTestSandbox: true,
      });

      await runtime.initialize();

      const tools = runtime.getContext().listTools();
      expect(tools.length).toBeGreaterThan(0);
      expect(tools.some((t) => t.name === "read_file")).toBe(true);
      expect(tools.some((t) => t.name === "write_file")).toBe(true);
    });

    it("throws error if filesystem toolset requested without sandbox", async () => {
      const runtime = new WorkerRuntime({
        worker: workerWithFilesystem,
      });

      await expect(runtime.initialize()).rejects.toThrow("Filesystem toolset requires a sandbox");
    });
  });

  describe("run", () => {
    it("returns success with response when LLM completes without tool calls", async () => {
      mockAskFn.mockResolvedValueOnce({
        type: "success",
        stopReason: "complete",
        message: {
          role: "assistant",
          content: "Hello! How can I help you?",
          timestamp: new Date(),
          usage: { input: 10, output: 20 },
          provider: "mock",
          model: "mock-model",
          took: 1.5,
        },
        tokens: { input: 10, output: 20 },
        cost: 0.001,
      });

      const runtime = new WorkerRuntime({
        worker: simpleWorker,
      });

      const result = await runtime.run("Hello!");

      expect(result.success).toBe(true);
      expect(result.response).toBe("Hello! How can I help you?");
      expect(result.toolCallCount).toBe(0);
      expect(result.tokens).toEqual({ input: 10, output: 20 });
      expect(result.cost).toBe(0.001);
    });

    it("returns error when LLM fails", async () => {
      mockAskFn.mockResolvedValueOnce({
        type: "error",
        error: {
          type: "api_error",
          message: "Something went wrong",
          retryable: false,
        },
      });

      const runtime = new WorkerRuntime({
        worker: simpleWorker,
      });

      const result = await runtime.run("Hello!");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Something went wrong");
    });

    it("handles exceptions gracefully", async () => {
      mockAskFn.mockRejectedValueOnce(new Error("Network error"));

      const runtime = new WorkerRuntime({
        worker: simpleWorker,
      });

      const result = await runtime.run("Hello!");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
    });

    it("handles tool calls and iterates", async () => {
      // First call returns tool call
      mockAskFn
        .mockResolvedValueOnce({
          type: "success",
          stopReason: "tool_call",
          message: {
            role: "assistant",
            content: null,
            toolCalls: [
              {
                id: "call_1",
                name: "read_file",
                arguments: { path: "/session/test-session/working/test.txt" },
              },
            ],
            timestamp: new Date(),
            usage: { input: 10, output: 15 },
            provider: "mock",
            model: "mock-model",
            took: 1.0,
          },
          tokens: { input: 10, output: 15 },
          cost: 0.0005,
        })
        // Second call completes
        .mockResolvedValueOnce({
          type: "success",
          stopReason: "complete",
          message: {
            role: "assistant",
            content: "I read the file.",
            timestamp: new Date(),
            usage: { input: 25, output: 20 },
            provider: "mock",
            model: "mock-model",
            took: 1.2,
          },
          tokens: { input: 25, output: 20 },
          cost: 0.0008,
        });

      const runtime = new WorkerRuntime({
        worker: workerWithFilesystem,
        useTestSandbox: true,
        approvalMode: "approve_all",
      });
      await runtime.initialize();

      // Create the file first
      const sandbox = runtime.getSandbox()!;
      await sandbox.write("/session/test-session/working/test.txt", "test content");

      const result = await runtime.run("Read the file");

      expect(result.success).toBe(true);
      expect(result.response).toBe("I read the file.");
      expect(result.toolCallCount).toBe(1);
      expect(mockAskFn).toHaveBeenCalledTimes(2);
    });

    it("stops after max iterations", async () => {
      // Always return tool calls to trigger iteration limit
      mockAskFn.mockResolvedValue({
        type: "success",
        stopReason: "tool_call",
        message: {
          role: "assistant",
          content: null,
          toolCalls: [
            {
              id: "call_1",
              name: "list_files",
              arguments: { path: "/session/test-session/working" },
            },
          ],
          timestamp: new Date(),
          usage: { input: 10, output: 15 },
          provider: "mock",
          model: "mock-model",
          took: 1.0,
        },
        tokens: { input: 10, output: 15 },
        cost: 0.0005,
      });

      const runtime = new WorkerRuntime({
        worker: workerWithFilesystem,
        useTestSandbox: true,
        approvalMode: "approve_all",
        maxIterations: 3,
      });
      await runtime.initialize();

      const result = await runtime.run("Keep listing forever");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Maximum iterations");
      expect(result.toolCallCount).toBe(3);
    });

    it("accumulates tokens and cost across iterations", async () => {
      mockAskFn
        .mockResolvedValueOnce({
          type: "success",
          stopReason: "tool_call",
          message: {
            role: "assistant",
            toolCalls: [{ id: "1", name: "list_files", arguments: { path: "/session/test-session/working" } }],
            timestamp: new Date(),
            usage: { input: 10, output: 10 },
            provider: "mock",
            model: "mock",
            took: 1,
          },
          tokens: { input: 10, output: 10 },
          cost: 0.001,
        })
        .mockResolvedValueOnce({
          type: "success",
          stopReason: "complete",
          message: {
            role: "assistant",
            content: "Done",
            timestamp: new Date(),
            usage: { input: 20, output: 5 },
            provider: "mock",
            model: "mock",
            took: 0.5,
          },
          tokens: { input: 20, output: 5 },
          cost: 0.002,
        });

      const runtime = new WorkerRuntime({
        worker: workerWithFilesystem,
        useTestSandbox: true,
        approvalMode: "approve_all",
      });
      await runtime.initialize();

      const result = await runtime.run("Do something");

      expect(result.tokens).toEqual({ input: 30, output: 15 });
      expect(result.cost).toBe(0.003);
    });
  });

  describe("approval controller", () => {
    it("uses specified approval mode", () => {
      const runtime = new WorkerRuntime({
        worker: simpleWorker,
        approvalMode: "strict",
      });

      expect(runtime.getApprovalController().mode).toBe("strict");
    });

    it("defaults to approve_all mode", () => {
      const runtime = new WorkerRuntime({
        worker: simpleWorker,
      });

      expect(runtime.getApprovalController().mode).toBe("approve_all");
    });
  });

  describe("createWorkerRuntime", () => {
    it("creates and initializes runtime", async () => {
      const runtime = await createWorkerRuntime({
        worker: simpleWorker,
      });

      expect(runtime).toBeInstanceOf(WorkerRuntime);
    });

    it("initializes sandbox when configured", async () => {
      const runtime = await createWorkerRuntime({
        worker: workerWithFilesystem,
        useTestSandbox: true,
      });

      expect(runtime.getSandbox()).toBeDefined();
    });
  });
});
