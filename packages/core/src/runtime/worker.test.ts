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
import { z } from "zod";
import type { WorkerDefinition } from "../worker-schema.js";

// Provide dummy API keys so model factory doesn't fail during tests.
process.env.ANTHROPIC_API_KEY ||= "test-api-key";
process.env.OPENAI_API_KEY ||= "test-api-key";
process.env.GOOGLE_GENERATIVE_AI_API_KEY ||= "test-api-key";

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
    mode: "single",
    allow_empty_input: false,
    server_side_tools: [],
    locked: false,
    max_context_tokens: 8000,
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

    it("throws error when worker needs sandbox but none is provided", () => {
      const workerWithFilesystem: WorkerDefinition = {
        ...simpleWorker,
        name: "filesystem-worker",
        toolsets: { filesystem: {} },
      };

      expect(() => {
        new WorkerRuntime({
          worker: workerWithFilesystem,
          approvalMode: "approve_all",
          model: TEST_MODEL,
        });
      }).toThrow("requires sandbox");
    });

    it("throws error when worker has sandbox restrictions but no sandbox provided", () => {
      const workerWithSandboxConfig: WorkerDefinition = {
        ...simpleWorker,
        name: "sandboxed-worker",
        sandbox: { restrict: "/workspace" },
      };

      expect(() => {
        new WorkerRuntime({
          worker: workerWithSandboxConfig,
          approvalMode: "approve_all",
          model: TEST_MODEL,
        });
      }).toThrow("requires sandbox");
    });

    it("throws error when worker needs git toolset but no sandbox provided", () => {
      const workerWithGit: WorkerDefinition = {
        ...simpleWorker,
        name: "git-worker",
        toolsets: { git: {} },
      };

      expect(() => {
        new WorkerRuntime({
          worker: workerWithGit,
          approvalMode: "approve_all",
          model: TEST_MODEL,
        });
      }).toThrow("requires sandbox");
    });
  });

  describe("run", () => {
    it("fails early on empty input by default", async () => {
      const runtime = new WorkerRuntime({
        worker: simpleWorker,
        approvalMode: "approve_all",
        model: TEST_MODEL,
      });
      await runtime.initialize();

      const result = await runtime.run("");

      expect(result.success).toBe(false);
      expect(result.error).toContain("No input provided");
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it("allows empty input when allow_empty_input is true", async () => {
      mockGenerateText.mockResolvedValueOnce({
        text: "Ok",
        toolCalls: [],
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 1 },
      });

      const runtime = new WorkerRuntime({
        worker: { ...simpleWorker, allow_empty_input: true },
        approvalMode: "approve_all",
        model: TEST_MODEL,
      });
      await runtime.initialize();

      const result = await runtime.run("");

      expect(result.success).toBe(true);
      expect(mockGenerateText).toHaveBeenCalled();
    });

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

    it("enforces attachment policy limits", async () => {
      const workerWithPolicy: WorkerDefinition = {
        ...simpleWorker,
        attachment_policy: {
          max_attachments: 1,
          max_total_bytes: 100,
          allowed_suffixes: [],
          denied_suffixes: [],
        },
      };

      const runtime = new WorkerRuntime({
        worker: workerWithPolicy,
        approvalMode: "approve_all",
        model: TEST_MODEL,
      });
      await runtime.initialize();

      const result = await runtime.run({
        content: "process files",
        attachments: [
          { mimeType: "text/plain", data: "file-a", name: "a.txt" },
          { mimeType: "text/plain", data: "file-b", name: "b.txt" },
        ],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Attachment policy violation");
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it("rejects attachments that are not in allowed suffix list", async () => {
      const workerWithPolicy: WorkerDefinition = {
        ...simpleWorker,
        attachment_policy: {
          max_attachments: 2,
          max_total_bytes: 1_000,
          allowed_suffixes: [".txt"],
          denied_suffixes: [],
        },
      };

      const runtime = new WorkerRuntime({
        worker: workerWithPolicy,
        approvalMode: "approve_all",
        model: TEST_MODEL,
      });
      await runtime.initialize();

      const result = await runtime.run({
        content: "process image",
        attachments: [{ mimeType: "image/png", data: "fake-bytes", name: "diagram.png" }],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Attachment policy violation");
      expect(mockGenerateText).not.toHaveBeenCalled();
    });

    it("excludes manual-only tools from LLM invocation", async () => {
      const manualTool = {
        name: "git_push",
        description: "Manual git push",
        inputSchema: z.object({}),
        execute: vi.fn(),
        manualExecution: { mode: "manual" as const },
      };
      const llmTool = {
        name: "code_search",
        description: "Search codebase",
        inputSchema: z.object({
          query: z.string(),
        }),
        execute: vi.fn(),
      };

      const runtime = new WorkerRuntime({
        worker: simpleWorker,
        approvalMode: "approve_all",
        model: TEST_MODEL,
        tools: {
          git_push: manualTool,
          code_search: llmTool,
        },
      });
      await runtime.initialize();

      mockGenerateText.mockResolvedValueOnce({
        text: "Done",
        toolCalls: [],
        finishReason: "stop",
        usage: { inputTokens: 1, outputTokens: 1 },
      });

      await runtime.run("search");

      const callArgs = mockGenerateText.mock.calls[0][0];
      expect(callArgs.tools).toBeDefined();
      expect(Object.keys(callArgs.tools)).toEqual(["code_search"]);
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

describe("dispose", () => {
  it("unsubscribes runtime UI handlers", async () => {
    const simpleWorker: WorkerDefinition = {
      name: "test-worker",
      instructions: "You are a helpful assistant.",
      description: "A test worker",
      mode: "single",
      allow_empty_input: false,
      server_side_tools: [],
      locked: false,
      max_context_tokens: 8000,
    };
    const unsubManual = vi.fn();
    const unsubDiff = vi.fn();
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
      updateContextUsage: vi.fn(),
      onInterrupt: vi.fn(() => vi.fn()),
      onManualToolInvoke: vi.fn(() => unsubManual),
      onGetDiff: vi.fn(() => unsubDiff),
    };

    const runtime = new WorkerRuntime({
      worker: simpleWorker,
      approvalMode: "approve_all",
      model: TEST_MODEL,
      runtimeUI: mockRuntimeUI,
    });
    await runtime.initialize();

    await runtime.dispose();

    expect(unsubManual).toHaveBeenCalledTimes(1);
    expect(unsubDiff).toHaveBeenCalledTimes(1);
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
    mode: "single",
    allow_empty_input: false,
    server_side_tools: [],
    locked: false,
    max_context_tokens: 8000,
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
      updateContextUsage: vi.fn(),
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
    expect(mockRuntimeUI.updateWorker).toHaveBeenNthCalledWith(
      1,
      expect.any(String), // workerId
      "test-worker",
      "running",
      undefined,
      0,
      TEST_MODEL,
      []
    );

    // Should emit showMessage with assistant response
    expect(mockRuntimeUI.showMessage).toHaveBeenCalledWith({
      role: "assistant",
      content: "Hello there!",
    });

    // Should emit workerUpdate with 'complete' status
    expect(mockRuntimeUI.updateWorker).toHaveBeenNthCalledWith(
      2,
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
      updateContextUsage: vi.fn(),
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
