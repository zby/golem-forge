/**
 * Tests for Core WorkerRuntime
 *
 * Tests for the core runtime behavior including:
 * - Constructor validation
 * - Model resolution and compatibility
 * - Run loop behavior (without platform-specific tools)
 * - Approval controller integration
 * - RuntimeUI event emission
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WorkerDefinition } from "../worker-schema.js";

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

// Default model for tests
const TEST_MODEL = "anthropic:claude-haiku-4-5";

describe("WorkerRuntime", () => {
  const simpleWorker: WorkerDefinition = {
    name: "test-worker",
    instructions: "You are a helpful assistant.",
    description: "A test worker",
    server_side_tools: [],
    locked: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("creates runtime with worker definition", () => {
      const runtime = new WorkerRuntime({
        worker: simpleWorker,
        approvalMode: "approve_all",
        model: TEST_MODEL,
      });

      expect(runtime).toBeInstanceOf(WorkerRuntime);
    });

    it("stores worker instructions", () => {
      const runtime = new WorkerRuntime({
        worker: simpleWorker,
        approvalMode: "approve_all",
        model: TEST_MODEL,
      });

      expect(runtime).toBeDefined();
    });

    it("throws error when interactive mode has no callback", () => {
      expect(() => {
        new WorkerRuntime({
          worker: simpleWorker,
          approvalMode: "interactive",
          model: TEST_MODEL,
        });
      }).toThrow("requires an approvalCallback");
    });

    it("allows interactive mode with callback", () => {
      const runtime = new WorkerRuntime({
        worker: simpleWorker,
        approvalMode: "interactive",
        approvalCallback: async () => ({ approved: true, remember: "none" }),
        model: TEST_MODEL,
      });

      expect(runtime).toBeInstanceOf(WorkerRuntime);
    });

    it("throws error if run() called before initialize()", async () => {
      const runtime = new WorkerRuntime({
        worker: simpleWorker,
        approvalMode: "approve_all",
        model: TEST_MODEL,
      });

      await expect(runtime.run("Hello!")).rejects.toThrow(
        "WorkerRuntime.run() called before initialize()"
      );
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
        model: TEST_MODEL,
      });
      await runtime.initialize();

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
        model: TEST_MODEL,
      });
      await runtime.initialize();

      const result = await runtime.run("Hello!");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Something went wrong");
    });

    it("handles exceptions gracefully", async () => {
      mockGenerateText.mockRejectedValueOnce(new Error("Network error"));

      const runtime = new WorkerRuntime({
        worker: simpleWorker,
        approvalMode: "approve_all",
        model: TEST_MODEL,
      });
      await runtime.initialize();

      const result = await runtime.run("Hello!");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network error");
    });
  });

  describe("approval controller", () => {
    it("uses specified approval mode", () => {
      const runtime = new WorkerRuntime({
        worker: simpleWorker,
        approvalMode: "auto_deny",
        model: TEST_MODEL,
      });

      expect(runtime.getApprovalController().mode).toBe("auto_deny");
    });

    it("defaults to interactive mode when callback provided", () => {
      const runtime = new WorkerRuntime({
        worker: simpleWorker,
        approvalCallback: async () => ({ approved: true, remember: "none" }),
        model: TEST_MODEL,
      });

      expect(runtime.getApprovalController().mode).toBe("interactive");
    });
  });

  describe("createWorkerRuntime", () => {
    it("creates and initializes runtime", async () => {
      const runtime = await createWorkerRuntime({
        worker: simpleWorker,
        approvalMode: "approve_all",
        model: TEST_MODEL,
      });

      expect(runtime).toBeInstanceOf(WorkerRuntime);
    });
  });

  describe("model resolution", () => {
    it("uses provided model", () => {
      const runtime = new WorkerRuntime({
        worker: simpleWorker,
        model: "openai:gpt-4",
        approvalMode: "approve_all",
      });

      expect(runtime.getModelId()).toBe("openai:gpt-4");
    });

    it("throws error when no model specified", () => {
      expect(() => {
        new WorkerRuntime({
          worker: simpleWorker,
          approvalMode: "approve_all",
        });
      }).toThrow("No model specified");
    });

    it("validates model against compatible_models", () => {
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

    it("allows compatible model", () => {
      const workerWithCompatibility: WorkerDefinition = {
        ...simpleWorker,
        compatible_models: ["anthropic:*"],
      };

      const runtime = new WorkerRuntime({
        worker: workerWithCompatibility,
        model: "anthropic:claude-sonnet-4",
        approvalMode: "approve_all",
      });

      expect(runtime.getModelId()).toBe("anthropic:claude-sonnet-4");
    });

    it("rejects empty compatible_models array", () => {
      const workerWithEmptyCompat: WorkerDefinition = {
        ...simpleWorker,
        compatible_models: [],
      };

      expect(() => {
        new WorkerRuntime({
          worker: workerWithEmptyCompat,
          model: TEST_MODEL,
          approvalMode: "approve_all",
        });
      }).toThrow("empty compatible_models");
    });

    it("error message includes compatible patterns when no model specified", () => {
      const workerRequiringOpenai: WorkerDefinition = {
        ...simpleWorker,
        compatible_models: ["openai:*"],
      };

      expect(() => {
        new WorkerRuntime({
          worker: workerRequiringOpenai,
          approvalMode: "approve_all",
        });
      }).toThrow("Compatible patterns: openai:*");
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
    expect(matchModelPattern("openai:gpt-4.5", "openai:gpt-4.5")).toBe(true);
    expect(matchModelPattern("openai:gpt-4x5", "openai:gpt-4.5")).toBe(false);
  });
});

describe("RuntimeUI event emission", () => {
  const simpleWorker: WorkerDefinition = {
    name: "test-worker",
    instructions: "You are a helpful assistant.",
    description: "A test worker",
    server_side_tools: [],
    locked: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits workerUpdate and message events on successful run", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "Hello there!",
      toolCalls: [],
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 5 },
    });

    const mockBus = {
      emit: vi.fn(),
      on: vi.fn(() => vi.fn()),
      off: vi.fn(),
      clear: vi.fn(),
    };

    const mockRuntimeUI = {
      bus: mockBus,
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
      onManualToolInvoke: vi.fn(() => vi.fn()),
      onGetDiff: vi.fn(() => vi.fn()),
    };

    const runtime = new WorkerRuntime({
      worker: simpleWorker,
      approvalMode: "approve_all",
      model: TEST_MODEL,
      runtimeUI: mockRuntimeUI,
    });
    await runtime.initialize();

    const result = await runtime.run("Hello!");

    expect(result.success).toBe(true);

    // Should emit workerUpdate with 'running' status at start
    expect(mockRuntimeUI.updateWorker).toHaveBeenCalledWith(
      expect.any(String), // workerId
      "test-worker",
      "running",
      undefined,
      0
    );

    // Should emit showMessage with assistant response
    expect(mockRuntimeUI.showMessage).toHaveBeenCalledWith({
      role: "assistant",
      content: "Hello there!",
    });

    // Should emit workerUpdate with 'complete' status
    expect(mockRuntimeUI.updateWorker).toHaveBeenCalledWith(
      expect.any(String), // workerId
      "test-worker",
      "complete",
      undefined,
      0
    );

    // Should emit endSession for root worker
    expect(mockRuntimeUI.endSession).toHaveBeenCalledWith("completed");
  });

  it("emits error events on failure", async () => {
    mockGenerateText.mockRejectedValueOnce(new Error("API error"));

    const mockBus = {
      emit: vi.fn(),
      on: vi.fn(() => vi.fn()),
      off: vi.fn(),
      clear: vi.fn(),
    };

    const mockRuntimeUI = {
      bus: mockBus,
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
      onManualToolInvoke: vi.fn(() => vi.fn()),
      onGetDiff: vi.fn(() => vi.fn()),
    };

    const runtime = new WorkerRuntime({
      worker: simpleWorker,
      approvalMode: "approve_all",
      model: TEST_MODEL,
      runtimeUI: mockRuntimeUI,
    });
    await runtime.initialize();

    const result = await runtime.run("Hello!");

    expect(result.success).toBe(false);

    // Should emit showStatus with error
    expect(mockRuntimeUI.showStatus).toHaveBeenCalledWith("error", "API error");

    // Should emit workerUpdate with 'error' status
    expect(mockRuntimeUI.updateWorker).toHaveBeenCalledWith(
      expect.any(String),
      "test-worker",
      "error",
      undefined,
      0
    );

    // Should emit endSession with error
    expect(mockRuntimeUI.endSession).toHaveBeenCalledWith("error", "API error");
  });
});
