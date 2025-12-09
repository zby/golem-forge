/**
 * Tests for CLI Worker Runtime Factory
 *
 * CLI-specific tests for:
 * - createCLIWorkerRuntime factory function
 * - Sandbox creation and configuration
 * - Toolset registration (filesystem, workers, custom)
 * - Tool execution with CLI toolsets
 *
 * Core WorkerRuntime tests are in packages/core/src/runtime/worker.test.ts
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WorkerDefinition } from "../worker/schema.js";

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
import { createCLIWorkerRuntime } from "./factory.js";
import { WorkerRuntime } from "@golem-forge/core";

// Default model for tests
const TEST_MODEL = "anthropic:claude-haiku-4-5";

describe("createCLIWorkerRuntime", () => {
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

  describe("factory function", () => {
    it("creates and initializes runtime", async () => {
      const runtime = await createCLIWorkerRuntime({
        worker: simpleWorker,
        approvalMode: "approve_all",
        model: TEST_MODEL,
      });

      expect(runtime).toBeInstanceOf(WorkerRuntime);
    });

    it("throws error when interactive mode has no callback", async () => {
      await expect(createCLIWorkerRuntime({
        worker: simpleWorker,
        approvalMode: "interactive",
        model: TEST_MODEL,
      })).rejects.toThrow("requires an approvalCallback");
    });
  });

  describe("sandbox creation", () => {
    it("creates test sandbox when useTestSandbox is true", async () => {
      const runtime = await createCLIWorkerRuntime({
        worker: workerWithFilesystem,
        useTestSandbox: true,
        approvalMode: "approve_all",
        model: TEST_MODEL,
      });

      expect(runtime.getSandbox()).toBeDefined();
    });

    it("initializes sandbox when configured", async () => {
      const runtime = await createCLIWorkerRuntime({
        worker: workerWithFilesystem,
        useTestSandbox: true,
        approvalMode: "approve_all",
        model: TEST_MODEL,
      });

      expect(runtime.getSandbox()).toBeDefined();
    });
  });

  describe("toolset registration", () => {
    it("registers filesystem tools when toolset is configured", async () => {
      const runtime = await createCLIWorkerRuntime({
        worker: workerWithFilesystem,
        useTestSandbox: true,
        approvalMode: "approve_all",
        model: TEST_MODEL,
      });

      const tools = runtime.getTools();
      const toolNames = Object.keys(tools);
      expect(toolNames.length).toBeGreaterThan(0);
      expect(toolNames).toContain("read_file");
      expect(toolNames).toContain("write_file");
    });

    it("throws error if filesystem toolset requested without sandbox", async () => {
      await expect(createCLIWorkerRuntime({
        worker: workerWithFilesystem,
        approvalMode: "approve_all",
        model: TEST_MODEL,
      })).rejects.toThrow("Filesystem toolset requires a sandbox");
    });

    it("throws error for unknown toolset", async () => {
      const workerWithUnknownToolset: WorkerDefinition = {
        name: "unknown-toolset-worker",
        instructions: "Test worker",
        toolsets: {
          unknownToolset: {},
        },
      };

      await expect(createCLIWorkerRuntime({
        worker: workerWithUnknownToolset,
        useTestSandbox: true,
        approvalMode: "approve_all",
        model: TEST_MODEL,
      })).rejects.toThrow('Unknown toolset "unknownToolset"');
    });
  });

  describe("tool execution", () => {
    it("handles tool calls and iterates", async () => {
      // First call returns tool call
      mockGenerateText
        .mockResolvedValueOnce({
          text: "",
          toolCalls: [
            {
              toolCallId: "call_1",
              toolName: "read_file",
              args: { path: "/workspace/test.txt" },
            },
          ],
          finishReason: "tool-calls",
          usage: { inputTokens: 10, outputTokens: 15 },
        })
        // Second call completes
        .mockResolvedValueOnce({
          text: "I read the file.",
          toolCalls: [],
          finishReason: "stop",
          usage: { inputTokens: 25, outputTokens: 20 },
        });

      const runtime = await createCLIWorkerRuntime({
        worker: workerWithFilesystem,
        useTestSandbox: true,
        approvalMode: "approve_all",
        model: TEST_MODEL,
      });

      // Create the file first
      const sandbox = runtime.getSandbox()!;
      await sandbox.write("/workspace/test.txt", "test content");

      const result = await runtime.run("Read the file");

      expect(result.success).toBe(true);
      expect(result.response).toBe("I read the file.");
      expect(result.toolCallCount).toBe(1);
      expect(mockGenerateText).toHaveBeenCalledTimes(2);
    });

    it("stops after max iterations", async () => {
      // Always return tool calls to trigger iteration limit
      mockGenerateText.mockResolvedValue({
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
      });

      const runtime = await createCLIWorkerRuntime({
        worker: workerWithFilesystem,
        useTestSandbox: true,
        approvalMode: "approve_all",
        maxIterations: 3,
        model: TEST_MODEL,
      });

      const result = await runtime.run("Keep listing forever");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Maximum iterations");
      expect(result.toolCallCount).toBe(3);
    });

    it("accumulates tokens across iterations", async () => {
      mockGenerateText
        .mockResolvedValueOnce({
          text: "",
          toolCalls: [{ toolCallId: "1", toolName: "list_files", args: { path: "/workspace" } }],
          finishReason: "tool-calls",
          usage: { inputTokens: 10, outputTokens: 10 },
        })
        .mockResolvedValueOnce({
          text: "Done",
          toolCalls: [],
          finishReason: "stop",
          usage: { inputTokens: 20, outputTokens: 5 },
        });

      const runtime = await createCLIWorkerRuntime({
        worker: workerWithFilesystem,
        useTestSandbox: true,
        approvalMode: "approve_all",
        model: TEST_MODEL,
      });

      const result = await runtime.run("Do something");

      expect(result.tokens).toEqual({ input: 30, output: 15 });
    });

    it("handles hallucinated tool calls (tool not registered)", async () => {
      // LLM hallucinates a tool that doesn't exist
      mockGenerateText
        .mockResolvedValueOnce({
          text: "",
          toolCalls: [
            {
              toolCallId: "call_1",
              toolName: "nonexistent_tool",
              args: { param: "value" },
            },
          ],
          finishReason: "tool-calls",
          usage: { inputTokens: 10, outputTokens: 15 },
        })
        // After receiving error, LLM completes normally
        .mockResolvedValueOnce({
          text: "I apologize, that tool doesn't exist.",
          toolCalls: [],
          finishReason: "stop",
          usage: { inputTokens: 30, outputTokens: 20 },
        });

      const runtime = await createCLIWorkerRuntime({
        worker: workerWithFilesystem,
        useTestSandbox: true,
        approvalMode: "approve_all",
        model: TEST_MODEL,
      });

      const result = await runtime.run("Use a fake tool");

      // The run should complete successfully (LLM recovered from the error)
      expect(result.success).toBe(true);
      expect(result.response).toBe("I apologize, that tool doesn't exist.");
      // Tool call was attempted but failed
      expect(result.toolCallCount).toBe(1);
      // Verify the error was communicated back to the LLM
      expect(mockGenerateText).toHaveBeenCalledTimes(2);

      // Check that the second call included the tool error
      const secondCall = mockGenerateText.mock.calls[1][0];
      const messages = secondCall.messages;
      const toolMessage = messages.find((m: { role: string }) => m.role === "tool");
      expect(toolMessage).toBeDefined();
      // AI SDK v6: output is wrapped in { type: "json", value: ... }
      expect(toolMessage.content[0].output.value).toContain("Tool not found");
    });
  });

  describe("RuntimeUI integration with tools", () => {
    it("emits tool events during tool execution", async () => {
      mockGenerateText
        .mockResolvedValueOnce({
          text: "",
          toolCalls: [
            {
              toolCallId: "call_1",
              toolName: "read_file",
              args: { path: "/workspace/test.txt" },
            },
          ],
          finishReason: "tool-calls",
          usage: { inputTokens: 10, outputTokens: 15 },
        })
        .mockResolvedValueOnce({
          text: "Done!",
          toolCalls: [],
          finishReason: "stop",
          usage: { inputTokens: 25, outputTokens: 20 },
        });

      const mockRuntimeUI = {
        bus: {},
        showMessage: vi.fn(),
        showStatus: vi.fn(),
        startStreaming: vi.fn(),
        appendStreaming: vi.fn(),
        endStreaming: vi.fn(),
        showToolStarted: vi.fn(),
        showToolResult: vi.fn(),
        updateWorker: vi.fn(),
        showManualTools: vi.fn(),
        showDiffSummary: vi.fn(),
        showDiffContent: vi.fn(),
        endSession: vi.fn(),
        requestApproval: vi.fn(),
        getUserInput: vi.fn(),
        onInterrupt: vi.fn(),
        onManualToolInvoke: vi.fn(),
        onGetDiff: vi.fn(),
      };

      const runtime = await createCLIWorkerRuntime({
        worker: workerWithFilesystem,
        useTestSandbox: true,
        approvalMode: "approve_all",
        model: TEST_MODEL,
        runtimeUI: mockRuntimeUI,
      });

      // Create test file
      const sandbox = runtime.getSandbox()!;
      await sandbox.write("/workspace/test.txt", "file content");

      const result = await runtime.run("Read the file");

      expect(result.success).toBe(true);

      // Should emit toolStarted
      expect(mockRuntimeUI.showToolStarted).toHaveBeenCalledWith(
        "call_1",
        "read_file",
        { path: "/workspace/test.txt" }
      );

      // Should emit toolResult
      // Note: Core's ToolExecutor passes undefined for structuredResult - UI handles conversion
      expect(mockRuntimeUI.showToolResult).toHaveBeenCalledWith(
        "call_1",
        "read_file",
        "success",
        expect.any(Number), // durationMs
        undefined, // structuredResult - Core leaves conversion to UI
        undefined // no error
      );
    });
  });
});
