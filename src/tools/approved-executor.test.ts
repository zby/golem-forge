import { describe, it, expect, vi, beforeEach } from "vitest";
import { Context, defineTool, type ToolCall } from "@mariozechner/lemmy";
import { z } from "zod";
import { ApprovedExecutor } from "./approved-executor.js";
import {
  ApprovalController,
  ApprovalResult,
  type ApprovalDecision,
  type SupportsNeedsApproval,
} from "../approval/index.js";

// Test tools
const safeTool = defineTool({
  name: "safe_tool",
  description: "A safe tool that is pre-approved",
  schema: z.object({ input: z.string() }),
  execute: async (args) => ({ result: `safe: ${args.input}` }),
});

const dangerousTool = defineTool({
  name: "dangerous_tool",
  description: "A dangerous tool that needs approval",
  schema: z.object({ target: z.string() }),
  execute: async (args) => ({ result: `dangerous: ${args.target}` }),
});

const forbiddenTool = defineTool({
  name: "forbidden_tool",
  description: "A forbidden tool that is always blocked",
  schema: z.object({}),
  execute: async () => ({ result: "should never execute" }),
});

// Test toolset with custom approval logic
class TestToolset implements SupportsNeedsApproval<unknown> {
  needsApproval(name: string): ApprovalResult {
    if (name === "safe_tool") return ApprovalResult.preApproved();
    if (name === "forbidden_tool") return ApprovalResult.blocked("Tool is forbidden");
    return ApprovalResult.needsApproval();
  }
}

describe("ApprovedExecutor", () => {
  let context: Context;
  let toolset: TestToolset;

  beforeEach(() => {
    context = new Context();
    context.addTool(safeTool);
    context.addTool(dangerousTool);
    context.addTool(forbiddenTool);
    toolset = new TestToolset();
  });

  describe("with approve_all mode", () => {
    it("executes all tools without prompting", async () => {
      const controller = new ApprovalController({ mode: "approve_all" });
      const executor = new ApprovedExecutor({ context, approvalController: controller });

      const toolCall: ToolCall = {
        id: "call_1",
        name: "dangerous_tool",
        arguments: { target: "test" },
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
      const executor = new ApprovedExecutor({ context, approvalController: controller });

      const toolCall: ToolCall = {
        id: "call_1",
        name: "dangerous_tool",
        arguments: { target: "test" },
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
        context,
        approvalController: controller,
        toolset,
      });

      const toolCall: ToolCall = {
        id: "call_1",
        name: "safe_tool",
        arguments: { input: "hello" },
      };

      const result = await executor.executeTool(toolCall);

      expect(result.success).toBe(true);
      expect(result.preApproved).toBe(true);
    });

    it("blocks forbidden tools", async () => {
      const controller = new ApprovalController({ mode: "approve_all" }); // approve_all, but toolset blocks
      const executor = new ApprovedExecutor({
        context,
        approvalController: controller,
        toolset,
      });

      const toolCall: ToolCall = {
        id: "call_1",
        name: "forbidden_tool",
        arguments: {},
      };

      const result = await executor.executeTool(toolCall);

      expect(result.success).toBe(false);
      expect(result.blocked).toBe(true);
      if (!result.success) {
        expect(result.error.message).toContain("forbidden");
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
        context,
        approvalController: controller,
        toolset,
      });

      const toolCall: ToolCall = {
        id: "call_1",
        name: "dangerous_tool",
        arguments: { target: "test" },
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
        context,
        approvalController: controller,
        toolset,
      });

      const toolCalls: ToolCall[] = [
        { id: "call_1", name: "safe_tool", arguments: { input: "a" } },
        { id: "call_2", name: "dangerous_tool", arguments: { target: "b" } },
        { id: "call_3", name: "forbidden_tool", arguments: {} },
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
        context,
        approvalController: controller,
        toolset,
      });

      const toolCall: ToolCall = {
        id: "call_1",
        name: "dangerous_tool",
        arguments: { target: "test" },
      };

      // First call - prompts
      await executor.executeTool(toolCall);
      expect(mockCallback).toHaveBeenCalledTimes(1);

      // Second call with same args - uses cache
      const toolCall2: ToolCall = { ...toolCall, id: "call_2" };
      await executor.executeTool(toolCall2);
      expect(mockCallback).toHaveBeenCalledTimes(1); // Still 1, not called again
    });
  });
});
