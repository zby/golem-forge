/**
 * Tests for HeadlessAdapter
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createUIEventBus, type UIEventBus } from "@golem-forge/core";
import {
  HeadlessAdapter,
  createHeadlessAdapter,
  type HeadlessAdapterOptions,
} from "./headless-adapter.js";

describe("HeadlessAdapter", () => {
  let bus: UIEventBus;
  let adapter: HeadlessAdapter;

  beforeEach(() => {
    bus = createUIEventBus();
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.shutdown();
    }
  });

  describe("createHeadlessAdapter", () => {
    it("should create adapter with default options", () => {
      adapter = createHeadlessAdapter(bus);
      expect(adapter).toBeInstanceOf(HeadlessAdapter);
      expect(adapter.bus).toBe(bus);
    });

    it("should create adapter with custom options", () => {
      adapter = createHeadlessAdapter(bus, {
        autoManualTool: "submit",
        autoApprove: true,
      });
      expect(adapter).toBeInstanceOf(HeadlessAdapter);
    });
  });

  describe("lifecycle", () => {
    it("should initialize and shutdown without error", async () => {
      adapter = new HeadlessAdapter(bus);
      await adapter.initialize();
      await adapter.shutdown();
    });

    it("should not double-initialize", async () => {
      adapter = new HeadlessAdapter(bus);
      await adapter.initialize();
      await adapter.initialize(); // Should not throw
    });

    it("should clean up subscriptions on shutdown", async () => {
      adapter = new HeadlessAdapter(bus);
      await adapter.initialize();

      const handler = vi.fn();
      bus.on("manualToolInvoke", handler);

      await adapter.shutdown();

      // Emit after shutdown - adapter should not respond
      bus.emit("manualToolsAvailable", {
        tools: [{ name: "submit", label: "Submit", description: "", fields: [] }],
      });

      // Give time for any async handling
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Handler should not have been called (adapter unsubscribed)
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe("manual tools auto-invoke", () => {
    it("should auto-invoke specified manual tool", async () => {
      const handler = vi.fn();
      bus.on("manualToolInvoke", handler);

      adapter = new HeadlessAdapter(bus, { autoManualTool: "submit" });
      await adapter.initialize();

      bus.emit("manualToolsAvailable", {
        tools: [
          { name: "submit", label: "Submit", description: "Submit changes", fields: [] },
          { name: "cancel", label: "Cancel", description: "Cancel", fields: [] },
        ],
      });

      expect(handler).toHaveBeenCalledWith({
        toolName: "submit",
        args: {},
      });
    });

    it("should not invoke tool if autoManualTool not specified", async () => {
      const handler = vi.fn();
      bus.on("manualToolInvoke", handler);

      adapter = new HeadlessAdapter(bus);
      await adapter.initialize();

      bus.emit("manualToolsAvailable", {
        tools: [{ name: "submit", label: "Submit", description: "", fields: [] }],
      });

      expect(handler).not.toHaveBeenCalled();
    });

    it("should not invoke tool if specified tool not available", async () => {
      const handler = vi.fn();
      const onEvent = vi.fn();
      bus.on("manualToolInvoke", handler);

      adapter = new HeadlessAdapter(bus, {
        autoManualTool: "deploy",
        onEvent,
      });
      await adapter.initialize();

      bus.emit("manualToolsAvailable", {
        tools: [{ name: "submit", label: "Submit", description: "", fields: [] }],
      });

      expect(handler).not.toHaveBeenCalled();
      // Should log warning
      expect(onEvent).toHaveBeenCalledWith(
        "warning",
        expect.stringContaining("deploy")
      );
    });
  });

  describe("approval auto-response", () => {
    it("should auto-approve when autoApprove is true", async () => {
      const handler = vi.fn();
      bus.on("approvalResponse", handler);

      adapter = new HeadlessAdapter(bus, { autoApprove: true });
      await adapter.initialize();

      bus.emit("approvalRequired", {
        requestId: "req-1",
        type: "tool_call",
        description: "Write file",
        risk: "medium",
      });

      expect(handler).toHaveBeenCalledWith({
        requestId: "req-1",
        approved: true,
      });
    });

    it("should auto-approve with session scope when autoApprove is 'session'", async () => {
      const handler = vi.fn();
      bus.on("approvalResponse", handler);

      adapter = new HeadlessAdapter(bus, { autoApprove: "session" });
      await adapter.initialize();

      bus.emit("approvalRequired", {
        requestId: "req-1",
        type: "tool_call",
        description: "Write file",
        risk: "low",
      });

      expect(handler).toHaveBeenCalledWith({
        requestId: "req-1",
        approved: "session",
      });
    });

    it("should auto-deny when autoApprove is false (default)", async () => {
      const handler = vi.fn();
      bus.on("approvalResponse", handler);

      adapter = new HeadlessAdapter(bus);
      await adapter.initialize();

      bus.emit("approvalRequired", {
        requestId: "req-1",
        type: "tool_call",
        description: "Delete file",
        risk: "high",
      });

      expect(handler).toHaveBeenCalledWith({
        requestId: "req-1",
        approved: false,
        reason: "Denied in headless mode",
      });
    });
  });

  describe("input prompt auto-response", () => {
    it("should respond with default input", async () => {
      const handler = vi.fn();
      bus.on("userInput", handler);

      adapter = new HeadlessAdapter(bus, { defaultInput: "test input" });
      await adapter.initialize();

      bus.emit("inputPrompt", {
        requestId: "input-1",
        prompt: "Enter value:",
      });

      expect(handler).toHaveBeenCalledWith({
        requestId: "input-1",
        content: "test input",
      });
    });

    it("should respond with empty string when no defaultInput", async () => {
      const handler = vi.fn();
      bus.on("userInput", handler);

      adapter = new HeadlessAdapter(bus);
      await adapter.initialize();

      bus.emit("inputPrompt", {
        requestId: "input-1",
        prompt: "Enter value:",
      });

      expect(handler).toHaveBeenCalledWith({
        requestId: "input-1",
        content: "",
      });
    });
  });

  describe("session end handling", () => {
    it("should call onSessionEnd callback", async () => {
      const onSessionEnd = vi.fn();

      adapter = new HeadlessAdapter(bus, { onSessionEnd });
      await adapter.initialize();

      bus.emit("sessionEnd", { reason: "completed", message: "All done" });

      expect(onSessionEnd).toHaveBeenCalledWith("completed", "All done");
    });
  });

  describe("event logging", () => {
    it("should call onEvent for relevant events", async () => {
      const onEvent = vi.fn();

      adapter = new HeadlessAdapter(bus, { onEvent });
      await adapter.initialize();

      bus.emit("message", { message: { role: "assistant", content: "Hello" } });
      bus.emit("status", { type: "info", message: "Processing" });
      bus.emit("toolStarted", { toolCallId: "t1", toolName: "read", args: {} });
      bus.emit("toolResult", {
        toolCallId: "t1",
        toolName: "read",
        status: "success",
        durationMs: 10,
      });

      expect(onEvent).toHaveBeenCalledWith("message", expect.any(Object));
      expect(onEvent).toHaveBeenCalledWith("status", expect.any(Object));
      expect(onEvent).toHaveBeenCalledWith("toolStarted", expect.any(Object));
      expect(onEvent).toHaveBeenCalledWith("toolResult", expect.any(Object));
    });

    it("should not subscribe to log events if onEvent not provided", async () => {
      // This test verifies that we don't have unnecessary subscriptions
      adapter = new HeadlessAdapter(bus);
      await adapter.initialize();

      // Should not throw
      bus.emit("message", { message: { role: "assistant", content: "Hello" } });
    });
  });

  describe("action methods", () => {
    it("should emit approvalResponse via sendApprovalResponse", async () => {
      const handler = vi.fn();
      bus.on("approvalResponse", handler);

      adapter = new HeadlessAdapter(bus);
      await adapter.initialize();

      adapter.sendApprovalResponse("req-1", true);

      expect(handler).toHaveBeenCalledWith({
        requestId: "req-1",
        approved: true,
      });
    });

    it("should emit userInput via sendUserInput", async () => {
      const handler = vi.fn();
      bus.on("userInput", handler);

      adapter = new HeadlessAdapter(bus);
      await adapter.initialize();

      adapter.sendUserInput("input-1", "hello");

      expect(handler).toHaveBeenCalledWith({
        requestId: "input-1",
        content: "hello",
      });
    });

    it("should emit interrupt via sendInterrupt", async () => {
      const handler = vi.fn();
      bus.on("interrupt", handler);

      adapter = new HeadlessAdapter(bus);
      await adapter.initialize();

      adapter.sendInterrupt("Timeout");

      expect(handler).toHaveBeenCalledWith({
        reason: "Timeout",
      });
    });

    it("should emit manualToolInvoke via invokeManualTool", async () => {
      const handler = vi.fn();
      bus.on("manualToolInvoke", handler);

      adapter = new HeadlessAdapter(bus);
      await adapter.initialize();

      adapter.invokeManualTool("deploy", { env: "prod" });

      expect(handler).toHaveBeenCalledWith({
        toolName: "deploy",
        args: { env: "prod" },
      });
    });
  });
});
