/**
 * Tests for Worker Execution Runtime
 *
 * Note: These tests focus on configuration and initialization.
 * Tests that require LLM calls use mocked generateText.
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
import { WorkerRuntime, createWorkerRuntime, matchModelPattern } from "./worker.js";

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
        approvalMode: "approve_all",
      });

      expect(runtime).toBeInstanceOf(WorkerRuntime);
    });

    it("stores worker instructions", () => {
      const runtime = new WorkerRuntime({
        worker: simpleWorker,
        approvalMode: "approve_all",
      });

      // The instructions are stored and used when run() is called
      expect(runtime).toBeDefined();
    });

    it("throws error when interactive mode has no callback", () => {
      expect(() => {
        new WorkerRuntime({
          worker: simpleWorker,
          approvalMode: "interactive",
        });
      }).toThrow("requires an approvalCallback");
    });

    it("allows interactive mode with callback", () => {
      const runtime = new WorkerRuntime({
        worker: simpleWorker,
        approvalMode: "interactive",
        approvalCallback: async () => ({ approved: true, remember: "none" }),
      });

      expect(runtime).toBeInstanceOf(WorkerRuntime);
    });
  });

  describe("initialize", () => {
    it("creates test sandbox when useTestSandbox is true", async () => {
      const runtime = new WorkerRuntime({
        worker: workerWithFilesystem,
        useTestSandbox: true,
        approvalMode: "approve_all",
      });

      await runtime.initialize();

      expect(runtime.getSandbox()).toBeDefined();
    });

    it("registers filesystem tools when toolset is configured", async () => {
      const runtime = new WorkerRuntime({
        worker: workerWithFilesystem,
        useTestSandbox: true,
        approvalMode: "approve_all",
      });

      await runtime.initialize();

      const tools = runtime.getTools();
      const toolNames = Object.keys(tools);
      expect(toolNames.length).toBeGreaterThan(0);
      expect(toolNames).toContain("read_file");
      expect(toolNames).toContain("write_file");
    });

    it("throws error if filesystem toolset requested without sandbox", async () => {
      const runtime = new WorkerRuntime({
        worker: workerWithFilesystem,
        approvalMode: "approve_all",
      });

      await expect(runtime.initialize()).rejects.toThrow("Filesystem toolset requires a sandbox");
    });
  });

  describe("run", () => {
    it("returns success with response when LLM completes without tool calls", async () => {
      mockGenerateText.mockResolvedValueOnce({
        text: "Hello! How can I help you?",
        toolCalls: [],
        finishReason: "stop",
        usage: { inputTokens: 10, outputTokens: 20 },
      });

      const runtime = new WorkerRuntime({
        worker: simpleWorker,
        approvalMode: "approve_all",
      });

      const result = await runtime.run("Hello!");

      expect(result.success).toBe(true);
      expect(result.response).toBe("Hello! How can I help you?");
      expect(result.toolCallCount).toBe(0);
      expect(result.tokens).toEqual({ input: 10, output: 20 });
    });

    it("returns error when LLM fails", async () => {
      mockGenerateText.mockRejectedValueOnce(new Error("Something went wrong"));

      const runtime = new WorkerRuntime({
        worker: simpleWorker,
        approvalMode: "approve_all",
      });

      const result = await runtime.run("Hello!");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Something went wrong");
    });

    it("handles exceptions gracefully", async () => {
      mockGenerateText.mockRejectedValueOnce(new Error("Network error"));

      const runtime = new WorkerRuntime({
        worker: simpleWorker,
        approvalMode: "approve_all",
      });

      const result = await runtime.run("Hello!");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
    });

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

      const runtime = new WorkerRuntime({
        worker: workerWithFilesystem,
        useTestSandbox: true,
        approvalMode: "approve_all",
      });
      await runtime.initialize();

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

      const runtime = new WorkerRuntime({
        worker: workerWithFilesystem,
        useTestSandbox: true,
        approvalMode: "approve_all",
      });
      await runtime.initialize();

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

      const runtime = new WorkerRuntime({
        worker: workerWithFilesystem,
        useTestSandbox: true,
        approvalMode: "approve_all",
      });
      await runtime.initialize();

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
      expect(toolMessage.content[0].output).toContain("Tool not found");
    });
  });

  describe("approval controller", () => {
    it("uses specified approval mode", () => {
      const runtime = new WorkerRuntime({
        worker: simpleWorker,
        approvalMode: "auto_deny",
      });

      expect(runtime.getApprovalController().mode).toBe("auto_deny");
    });

    it("defaults to interactive mode when callback provided", () => {
      const runtime = new WorkerRuntime({
        worker: simpleWorker,
        approvalCallback: async () => ({ approved: true, remember: "none" }),
      });

      expect(runtime.getApprovalController().mode).toBe("interactive");
    });
  });

  describe("createWorkerRuntime", () => {
    it("creates and initializes runtime", async () => {
      const runtime = await createWorkerRuntime({
        worker: simpleWorker,
        approvalMode: "approve_all",
      });

      expect(runtime).toBeInstanceOf(WorkerRuntime);
    });

    it("initializes sandbox when configured", async () => {
      const runtime = await createWorkerRuntime({
        worker: workerWithFilesystem,
        useTestSandbox: true,
        approvalMode: "approve_all",
      });

      expect(runtime.getSandbox()).toBeDefined();
    });
  });

  describe("model resolution", () => {
    it("uses worker model unconditionally when set", () => {
      const workerWithModel: WorkerDefinition = {
        ...simpleWorker,
        model: "anthropic:claude-sonnet-4",
      };

      const runtime = new WorkerRuntime({
        worker: workerWithModel,
        model: "openai:gpt-4", // CLI model should be ignored
        approvalMode: "approve_all",
      });

      const resolution = runtime.getModelResolution();
      expect(resolution.model).toBe("anthropic:claude-sonnet-4");
      expect(resolution.source).toBe("worker");
    });

    it("uses CLI model when worker has no model", () => {
      const runtime = new WorkerRuntime({
        worker: simpleWorker,
        model: "openai:gpt-4",
        approvalMode: "approve_all",
      });

      const resolution = runtime.getModelResolution();
      expect(resolution.model).toBe("openai:gpt-4");
      expect(resolution.source).toBe("cli");
    });

    it("uses caller model when no worker or CLI model", () => {
      const runtime = new WorkerRuntime({
        worker: simpleWorker,
        callerModel: "anthropic:claude-sonnet-4",
        approvalMode: "approve_all",
      });

      const resolution = runtime.getModelResolution();
      expect(resolution.model).toBe("anthropic:claude-sonnet-4");
      expect(resolution.source).toBe("caller");
    });

    it("uses default model when none specified", () => {
      const runtime = new WorkerRuntime({
        worker: simpleWorker,
        approvalMode: "approve_all",
      });

      const resolution = runtime.getModelResolution();
      expect(resolution.model).toBe("anthropic:claude-haiku-4-5");
      expect(resolution.source).toBe("default");
    });

    it("validates CLI model against compatible_models", () => {
      const workerWithCompatibility: WorkerDefinition = {
        ...simpleWorker,
        compatible_models: ["anthropic:*"],
      };

      expect(() => {
        new WorkerRuntime({
          worker: workerWithCompatibility,
          model: "openai:gpt-4",
          approvalMode: "approve_all",
        });
      }).toThrow('Model "openai:gpt-4" is not compatible');
    });

    it("allows compatible CLI model", () => {
      const workerWithCompatibility: WorkerDefinition = {
        ...simpleWorker,
        compatible_models: ["anthropic:*"],
      };

      const runtime = new WorkerRuntime({
        worker: workerWithCompatibility,
        model: "anthropic:claude-sonnet-4",
        approvalMode: "approve_all",
      });

      expect(runtime.getModelResolution().model).toBe("anthropic:claude-sonnet-4");
    });

    it("validates caller model against compatible_models", () => {
      const workerWithCompatibility: WorkerDefinition = {
        ...simpleWorker,
        compatible_models: ["anthropic:*", "google:*"],
      };

      expect(() => {
        new WorkerRuntime({
          worker: workerWithCompatibility,
          callerModel: "openai:gpt-4",
          approvalMode: "approve_all",
        });
      }).toThrow('Caller model "openai:gpt-4" is not compatible');
    });

    it("rejects empty compatible_models array", () => {
      const workerWithEmptyCompat: WorkerDefinition = {
        ...simpleWorker,
        compatible_models: [],
      };

      expect(() => {
        new WorkerRuntime({
          worker: workerWithEmptyCompat,
          approvalMode: "approve_all",
        });
      }).toThrow("empty compatible_models");
    });

    it("requires compatible model when default is incompatible", () => {
      const workerRequiringOpenai: WorkerDefinition = {
        ...simpleWorker,
        compatible_models: ["openai:*"],
      };

      expect(() => {
        new WorkerRuntime({
          worker: workerRequiringOpenai,
          approvalMode: "approve_all",
        });
      }).toThrow("default \"anthropic:claude-haiku-4-5\" is not compatible");
    });
  });
});

describe("matchModelPattern", () => {
  it("matches exact model names", () => {
    expect(matchModelPattern("anthropic:claude-sonnet-4", "anthropic:claude-sonnet-4")).toBe(true);
    expect(matchModelPattern("anthropic:claude-sonnet-4", "anthropic:claude-haiku")).toBe(false);
  });

  it("matches wildcard patterns", () => {
    expect(matchModelPattern("anthropic:claude-sonnet-4", "*")).toBe(true);
    expect(matchModelPattern("openai:gpt-4", "*")).toBe(true);
  });

  it("matches provider wildcards", () => {
    expect(matchModelPattern("anthropic:claude-sonnet-4", "anthropic:*")).toBe(true);
    expect(matchModelPattern("anthropic:claude-haiku-4-5", "anthropic:*")).toBe(true);
    expect(matchModelPattern("openai:gpt-4", "anthropic:*")).toBe(false);
  });

  it("matches suffix wildcards", () => {
    expect(matchModelPattern("anthropic:claude-haiku-4-5", "anthropic:claude-haiku-*")).toBe(true);
    expect(matchModelPattern("anthropic:claude-sonnet-4", "anthropic:claude-haiku-*")).toBe(false);
  });

  it("matches multiple wildcards", () => {
    expect(matchModelPattern("anthropic:claude-3-5-sonnet-20241022", "*:*sonnet*")).toBe(true);
    expect(matchModelPattern("openai:gpt-4o-mini", "*:*gpt*")).toBe(true);
  });

  it("escapes regex special characters", () => {
    // Dots in model names should be matched literally
    expect(matchModelPattern("openai:gpt-4.5", "openai:gpt-4.5")).toBe(true);
    expect(matchModelPattern("openai:gpt-4x5", "openai:gpt-4.5")).toBe(false);
  });
});
