import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { ApprovedExecutor, type ToolExecutorFn } from "./approved-executor.js";
import type { ToolCall } from "../ai/types.js";
import {
  ApprovalController,
  ApprovalResult,
  type ApprovalDecision,
  type SupportsNeedsApproval,
} from "../approval/index.js";

// Mock tool executor that simulates tool execution
function createMockExecutor(): ToolExecutorFn {
  return async (toolCall: ToolCall) => {
    switch (toolCall.toolName) {
      case "safe_tool":
        return {
          success: true,
          toolCallId: toolCall.toolCallId,
          result: { result: `safe: ${toolCall.args.input}` },
        };
      case "dangerous_tool":
        return {
          success: true,
          toolCallId: toolCall.toolCallId,
          result: { result: `dangerous: ${toolCall.args.target}` },
        };
      case "forbidden_tool":
        return {
          success: true,
          toolCallId: toolCall.toolCallId,
          result: { result: "should never execute" },
        };
      default:
        return {
          success: false,
          toolCallId: toolCall.toolCallId,
          error: { type: "not_found", toolName: toolCall.toolName, message: "Tool not found" },
        };
    }
  };
}

// Test toolset with custom approval logic
class TestToolset implements SupportsNeedsApproval<unknown> {
  needsApproval(name: string): ApprovalResult {
    if (name === "safe_tool") return ApprovalResult.preApproved();
    if (name === "forbidden_tool") return ApprovalResult.blocked("Tool is forbidden");
    return ApprovalResult.needsApproval();
  }
}

describe("ApprovedExecutor", () => {
  let executeToolFn: ToolExecutorFn;
  let toolset: TestToolset;

  beforeEach(() => {
    executeToolFn = createMockExecutor();
    toolset = new TestToolset();
  });

  describe("with approve_all mode", () => {
    it("executes all tools without prompting", async () => {
      const controller = new ApprovalController({ mode: "approve_all" });
      const executor = new ApprovedExecutor({ executeToolFn, approvalController: controller });

      const toolCall: ToolCall = {
        toolCallId: "call_1",
        toolName: "dangerous_tool",
        args: { target: "test" },
      };

      const result = await executor.executeTool(toolCall);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result).toEqual({ result: "dangerous: test" });
      }
    });
  });

  describe("with strict mode", () => {
    it("denies all tools that need approval", async () => {
      const controller = new ApprovalController({ mode: "strict" });
      const executor = new ApprovedExecutor({ executeToolFn, approvalController: controller });

      const toolCall: ToolCall = {
        toolCallId: "call_1",
        toolName: "dangerous_tool",
        args: { target: "test" },
      };

      const result = await executor.executeTool(toolCall);

      expect(result.success).toBe(false);
      expect(result.denied).toBe(true);
    });
  });

  describe("with custom toolset", () => {
    it("pre-approves safe tools", async () => {
      const controller = new ApprovalController({ mode: "strict" }); // strict, but toolset overrides
      const executor = new ApprovedExecutor({
        executeToolFn,
        approvalController: controller,
        toolset,
      });

      const toolCall: ToolCall = {
        toolCallId: "call_1",
        toolName: "safe_tool",
        args: { input: "hello" },
      };

      const result = await executor.executeTool(toolCall);

      expect(result.success).toBe(true);
      expect(result.preApproved).toBe(true);
    });

    it("blocks forbidden tools", async () => {
      const controller = new ApprovalController({ mode: "approve_all" }); // approve_all, but toolset blocks
      const executor = new ApprovedExecutor({
        executeToolFn,
        approvalController: controller,
        toolset,
      });

      const toolCall: ToolCall = {
        toolCallId: "call_1",
        toolName: "forbidden_tool",
        args: {},
      };

      const result = await executor.executeTool(toolCall);

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      if (!result.success) {
        expect(result.error?.message).toContain("forbidden");
      }
    });

    it("prompts for dangerous tools in interactive mode", async () => {
      const mockCallback = vi.fn().mockResolvedValue({
        approved: true,
        remember: "session",
      } as ApprovalDecision);

      const controller = new ApprovalController({
        mode: "interactive",
        approvalCallback: mockCallback,
      });

      const executor = new ApprovedExecutor({
        executeToolFn,
        approvalController: controller,
        toolset,
      });

      const toolCall: ToolCall = {
        toolCallId: "call_1",
        toolName: "dangerous_tool",
        args: { target: "test" },
      };

      const result = await executor.executeTool(toolCall);

      expect(mockCallback).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe("executeTools", () => {
    it("processes multiple tools sequentially", async () => {
      const controller = new ApprovalController({ mode: "approve_all" });
      const executor = new ApprovedExecutor({
        executeToolFn,
        approvalController: controller,
        toolset,
      });

      const toolCalls: ToolCall[] = [
        { toolCallId: "call_1", toolName: "safe_tool", args: { input: "a" } },
        { toolCallId: "call_2", toolName: "dangerous_tool", args: { target: "b" } },
        { toolCallId: "call_3", toolName: "forbidden_tool", args: {} },
      ];

      const results = await executor.executeTools(toolCalls);

      expect(results).toHaveLength(3);
      expect(results[0].success).toBe(true); // safe - pre-approved
      expect(results[0].preApproved).toBe(true);
      expect(results[1].success).toBe(true); // dangerous - approved by mode
      expect(results[2].success).toBe(false); // forbidden - blocked
      expect(results[2].blocked).toBe(true);
    });
  });

  describe("session caching", () => {
    it("caches approval for repeated calls", async () => {
      const mockCallback = vi.fn().mockResolvedValue({
        approved: true,
        remember: "session",
      } as ApprovalDecision);

      const controller = new ApprovalController({
        mode: "interactive",
        approvalCallback: mockCallback,
      });

      const executor = new ApprovedExecutor({
        executeToolFn,
        approvalController: controller,
        toolset,
      });

      const toolCall: ToolCall = {
        toolCallId: "call_1",
        toolName: "dangerous_tool",
        args: { target: "test" },
      };

      // First call - prompts
      await executor.executeTool(toolCall);
      expect(mockCallback).toHaveBeenCalledTimes(1);

      // Second call with same args - uses cache
      const toolCall2: ToolCall = { ...toolCall, toolCallId: "call_2" };
      await executor.executeTool(toolCall2);
      expect(mockCallback).toHaveBeenCalledTimes(1); // Still 1, not called again
    });
  });
});
