import { describe, it, expect, vi, beforeEach } from "vitest";
import { ToolExecutor } from "./tool-executor.js";
import { ApprovalController } from "../approval/index.js";

describe("ToolExecutor", () => {
  let approvalController: ApprovalController;

  beforeEach(() => {
    approvalController = new ApprovalController({ mode: "approve_all" });
  });

  it("handles undefined tool output without crashing", async () => {
    const tools = {
      noop: {
        description: "no-op",
        execute: vi.fn().mockResolvedValue(undefined),
      },
    } as any;

    const onEvent = vi.fn();
    const executor = new ToolExecutor({ tools, approvalController, onEvent });

    const result = await executor.execute(
      { toolCallId: "1", toolName: "noop", toolArgs: {} },
      { messages: [], iteration: 1 }
    );

    expect(result.isError).toBe(false);
    expect(result.output).toBeUndefined();

    const endEvent = onEvent.mock.calls.find(([event]) => event.type === "tool_call_end")?.[0];
    expect(endEvent).toBeDefined();
    expect(endEvent.output).toBe("undefined");
    expect(endEvent.truncated).toBe(false);
  });

  it("stringifies circular tool outputs safely", async () => {
    const circular: any = { ok: true };
    circular.self = circular;

    const tools = {
      circ: {
        description: "circular",
        execute: vi.fn().mockResolvedValue(circular),
      },
    } as any;

    const onEvent = vi.fn();
    const executor = new ToolExecutor({ tools, approvalController, onEvent });

    const result = await executor.execute(
      { toolCallId: "1", toolName: "circ", toolArgs: {} },
      { messages: [], iteration: 1 }
    );

    expect(result.isError).toBe(false);

    const endEvent = onEvent.mock.calls.find(([event]) => event.type === "tool_call_end")?.[0];
    expect(endEvent).toBeDefined();
    expect(typeof endEvent.output).toBe("string");
    expect(endEvent.output).toContain("[Circular]");
  });

  it("stringifies BigInt tool outputs safely", async () => {
    const tools = {
      big: {
        description: "bigint",
        execute: vi.fn().mockResolvedValue({ size: 1n }),
      },
    } as any;

    const onEvent = vi.fn();
    const executor = new ToolExecutor({ tools, approvalController, onEvent });

    const result = await executor.execute(
      { toolCallId: "1", toolName: "big", toolArgs: {} },
      { messages: [], iteration: 1 }
    );

    expect(result.isError).toBe(false);

    const endEvent = onEvent.mock.calls.find(([event]) => event.type === "tool_call_end")?.[0];
    expect(endEvent).toBeDefined();
    expect(endEvent.output).toContain("\"size\":\"1\"");
  });
});

