/**
 * Tests for Event-Based CLI Adapter
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PassThrough } from "stream";
import { createUIEventBus, type UIEventBus } from "@golem-forge/core";
import { EventCLIAdapter, createEventCLIAdapter, parseToolCommand } from "./event-cli-adapter.js";

// Helper to create mock streams
function createMockStreams() {
  const input = new PassThrough();
  const output = new PassThrough();

  // Capture output
  let outputBuffer = "";
  output.on("data", (chunk) => {
    outputBuffer += chunk.toString();
  });

  return {
    input,
    output,
    getOutput: () => outputBuffer,
    clearOutput: () => {
      outputBuffer = "";
    },
    // Simulate user input
    writeInput: (text: string) => {
      input.write(text + "\n");
    },
  };
}

describe("EventCLIAdapter", () => {
  let bus: UIEventBus;
  let adapter: EventCLIAdapter;
  let streams: ReturnType<typeof createMockStreams>;

  beforeEach(async () => {
    bus = createUIEventBus();
    streams = createMockStreams();
    adapter = new EventCLIAdapter(bus, {
      input: streams.input,
      output: streams.output,
      enableRawMode: false, // Disable for testing
    });
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.shutdown();
    streams.input.destroy();
    streams.output.destroy();
  });

  describe("createEventCLIAdapter", () => {
    it("should create adapter with default options", async () => {
      const newBus = createUIEventBus();
      const newAdapter = createEventCLIAdapter(newBus);
      expect(newAdapter).toBeInstanceOf(EventCLIAdapter);
      expect(newAdapter.bus).toBe(newBus);
    });
  });

  describe("message events", () => {
    it("should display user messages", () => {
      bus.emit("message", {
        message: { role: "user", content: "Hello" },
      });

      const output = streams.getOutput();
      expect(output).toContain("You");
      expect(output).toContain("Hello");
    });

    it("should display assistant messages in box", () => {
      bus.emit("message", {
        message: { role: "assistant", content: "Hi there!" },
      });

      const output = streams.getOutput();
      expect(output).toContain("Golem");
      expect(output).toContain("Hi there!");
    });

    it("should display system messages", async () => {
      // System messages only show at debug level
      await adapter.shutdown();
      adapter = new EventCLIAdapter(bus, {
        input: streams.input,
        output: streams.output,
        enableRawMode: false,
        traceLevel: "debug",
      });
      await adapter.initialize();
      streams.clearOutput();

      bus.emit("message", {
        message: { role: "system", content: "System info" },
      });

      const output = streams.getOutput();
      expect(output).toContain("System");
      expect(output).toContain("System info");
    });
  });

  describe("streaming events", () => {
    it("should output streaming deltas", () => {
      bus.emit("streaming", { requestId: "r1", delta: "Hello", done: false });
      bus.emit("streaming", { requestId: "r1", delta: " World", done: false });

      const output = streams.getOutput();
      expect(output).toContain("Hello");
      expect(output).toContain(" World");
    });

    it("should add newline on stream completion", () => {
      bus.emit("streaming", { requestId: "r1", delta: "Test", done: false });
      streams.clearOutput();

      bus.emit("streaming", { requestId: "r1", delta: "", done: true });

      const output = streams.getOutput();
      expect(output).toBe("\n");
    });
  });

  describe("status events", () => {
    it("should display info status", () => {
      bus.emit("status", { type: "info", message: "Processing..." });

      const output = streams.getOutput();
      expect(output).toContain("Processing...");
      expect(output).toContain("ℹ");
    });

    it("should display warning status", () => {
      bus.emit("status", { type: "warning", message: "Watch out!" });

      const output = streams.getOutput();
      expect(output).toContain("Watch out!");
      expect(output).toContain("⚠");
    });

    it("should display error status", () => {
      bus.emit("status", { type: "error", message: "Something failed" });

      const output = streams.getOutput();
      expect(output).toContain("Something failed");
      expect(output).toContain("✗");
    });
  });

  describe("tool events", () => {
    it("should display tool started", () => {
      bus.emit("toolStarted", {
        toolCallId: "t1",
        toolName: "read_file",
        args: { path: "/test.ts" },
      });

      const output = streams.getOutput();
      expect(output).toContain("read_file");
      expect(output).toContain("started");
    });

    it("should display successful tool result", () => {
      bus.emit("toolResult", {
        toolCallId: "t1",
        toolName: "test_tool",
        status: "success",
        durationMs: 50,
      });

      const output = streams.getOutput();
      expect(output).toContain("✓");
      expect(output).toContain("test_tool");
      expect(output).toContain("50ms");
    });

    it("should display error tool result", () => {
      bus.emit("toolResult", {
        toolCallId: "t1",
        toolName: "failing_tool",
        status: "error",
        error: "Something went wrong",
        durationMs: 10,
      });

      const output = streams.getOutput();
      expect(output).toContain("✗");
      expect(output).toContain("failing_tool");
      expect(output).toContain("failed");
      expect(output).toContain("Something went wrong");
    });

    it("should display interrupted tool result", () => {
      bus.emit("toolResult", {
        toolCallId: "t1",
        toolName: "long_tool",
        status: "interrupted",
        durationMs: 1000,
      });

      const output = streams.getOutput();
      expect(output).toContain("⚠");
      expect(output).toContain("long_tool");
      expect(output).toContain("interrupted");
    });

    it("should display text result value", () => {
      bus.emit("toolResult", {
        toolCallId: "t1",
        toolName: "echo",
        status: "success",
        value: { kind: "text", content: "Hello World" },
        durationMs: 5,
      });

      const output = streams.getOutput();
      expect(output).toContain("Hello World");
    });

    it("should display file content result", () => {
      bus.emit("toolResult", {
        toolCallId: "t1",
        toolName: "read_file",
        status: "success",
        value: {
          kind: "file_content",
          path: "/src/test.ts",
          content: "const x = 1;",
          size: 12,
        },
        durationMs: 10,
      });

      const output = streams.getOutput();
      expect(output).toContain("/src/test.ts");
      expect(output).toContain("12 bytes");
      expect(output).toContain("const x = 1;");
    });

    it("should display file list result", () => {
      bus.emit("toolResult", {
        toolCallId: "t1",
        toolName: "list_dir",
        status: "success",
        value: {
          kind: "file_list",
          path: "/src",
          files: ["index.ts", "utils.ts"],
          count: 2,
        },
        durationMs: 15,
      });

      const output = streams.getOutput();
      expect(output).toContain("/src");
      expect(output).toContain("2 entries");
      expect(output).toContain("index.ts");
      expect(output).toContain("utils.ts");
    });

    it("should display json result", () => {
      bus.emit("toolResult", {
        toolCallId: "t1",
        toolName: "api_call",
        status: "success",
        value: {
          kind: "json",
          data: { key: "value" },
          summary: "API response",
        },
        durationMs: 100,
      });

      const output = streams.getOutput();
      expect(output).toContain("api_call");
      expect(output).toContain("API response");
      expect(output).toContain('"key"');
    });

    it("should display custom result type with summary", () => {
      bus.emit("toolResult", {
        toolCallId: "t1",
        toolName: "git_status",
        status: "success",
        value: {
          kind: "git.status",
          data: { branch: "main", ahead: 2 },
          summary: "On branch main, 2 ahead",
        } as import("@golem-forge/core").ToolResultValue,
        durationMs: 25,
      });

      const output = streams.getOutput();
      expect(output).toContain("git_status");
      expect(output).toContain("On branch main, 2 ahead");
      expect(output).toContain("branch");
      expect(output).toContain("main");
    });

    it("should display custom result type without summary", () => {
      bus.emit("toolResult", {
        toolCallId: "t1",
        toolName: "custom_tool",
        status: "success",
        value: {
          kind: "my_custom_type",
          data: { foo: "bar" },
        } as import("@golem-forge/core").ToolResultValue,
        durationMs: 10,
      });

      const output = streams.getOutput();
      expect(output).toContain("custom_tool");
      expect(output).toContain("my_custom_type");
      expect(output).toContain("foo");
      expect(output).toContain("bar");
    });

    it("should not display hidden custom result type", () => {
      bus.emit("toolResult", {
        toolCallId: "t1",
        toolName: "internal_tool",
        status: "success",
        value: {
          kind: "internal.result",
          data: { secret: "hidden" },
          display: { preferredView: "hidden" },
        } as import("@golem-forge/core").ToolResultValue,
        durationMs: 5,
      });

      const output = streams.getOutput();
      // Should still show the header line but not the data
      expect(output).not.toContain("secret");
      expect(output).not.toContain("hidden");
    });

    it("should display custom result as table when preferredView is table", () => {
      bus.emit("toolResult", {
        toolCallId: "t1",
        toolName: "query_tool",
        status: "success",
        value: {
          kind: "db.query_result",
          data: [
            { id: 1, name: "Alice" },
            { id: 2, name: "Bob" },
          ],
          summary: "2 rows",
          display: { preferredView: "table" },
        } as import("@golem-forge/core").ToolResultValue,
        durationMs: 50,
      });

      const output = streams.getOutput();
      expect(output).toContain("query_tool");
      expect(output).toContain("2 rows");
      expect(output).toContain("id");
      expect(output).toContain("name");
      expect(output).toContain("Alice");
      expect(output).toContain("Bob");
    });

    it("should display custom result as code when preferredView is code", () => {
      bus.emit("toolResult", {
        toolCallId: "t1",
        toolName: "generate_code",
        status: "success",
        value: {
          kind: "code.snippet",
          data: "const x = 1;",
          summary: "Generated code",
          display: { preferredView: "code", language: "typescript" },
        } as import("@golem-forge/core").ToolResultValue,
        durationMs: 30,
      });

      const output = streams.getOutput();
      expect(output).toContain("generate_code");
      expect(output).toContain("Generated code");
      expect(output).toContain("const x = 1;");
      expect(output).toContain("```typescript");
    });
  });

  describe("worker events", () => {
    it("should display worker update with running status", () => {
      bus.emit("workerUpdate", {
        workerId: "w1",
        task: "Analyzing code",
        status: "running",
        depth: 0,
      });

      const output = streams.getOutput();
      expect(output).toContain("●");
      expect(output).toContain("Analyzing code");
    });

    it("should display worker update with complete status", () => {
      bus.emit("workerUpdate", {
        workerId: "w1",
        task: "Analysis complete",
        status: "complete",
        depth: 0,
      });

      const output = streams.getOutput();
      expect(output).toContain("✓");
      expect(output).toContain("Analysis complete");
    });

    it("should indent nested workers", () => {
      bus.emit("workerUpdate", {
        workerId: "w2",
        task: "Sub task",
        status: "running",
        parentId: "w1",
        depth: 2,
      });

      const output = streams.getOutput();
      // Should have indentation (4 spaces for depth 2)
      expect(output).toMatch(/^\s{4}/);
    });
  });

  describe("manual tools events", () => {
    it("should display available manual tools", () => {
      bus.emit("manualToolsAvailable", {
        tools: [
          {
            name: "run_tests",
            label: "Run Tests",
            description: "Execute test suite",
            category: "Testing",
            fields: [],
          },
          {
            name: "deploy",
            label: "Deploy",
            description: "Deploy application",
            category: "DevOps",
            fields: [],
          },
        ],
      });

      const output = streams.getOutput();
      expect(output).toContain("Available manual tools");
      expect(output).toContain("Testing");
      expect(output).toContain("run_tests");
      expect(output).toContain("DevOps");
      expect(output).toContain("deploy");
    });

    it("should show help hint in manual tools display", () => {
      bus.emit("manualToolsAvailable", {
        tools: [
          {
            name: "test_tool",
            label: "Test Tool",
            description: "A test tool",
            fields: [],
          },
        ],
      });

      const output = streams.getOutput();
      expect(output).toContain("/help");
      expect(output).toContain("/tool");
    });
  });

  describe("session end events", () => {
    it("should display completed session", () => {
      bus.emit("sessionEnd", { reason: "completed", message: "All done" });

      const output = streams.getOutput();
      expect(output).toContain("✓");
      expect(output).toContain("completed");
      expect(output).toContain("All done");
    });

    it("should display error session", () => {
      bus.emit("sessionEnd", { reason: "error", message: "Failed" });

      const output = streams.getOutput();
      expect(output).toContain("✗");
      expect(output).toContain("error");
      expect(output).toContain("Failed");
    });

    it("should display interrupted session", () => {
      bus.emit("sessionEnd", { reason: "interrupted" });

      const output = streams.getOutput();
      expect(output).toContain("⚠");
      expect(output).toContain("interrupted");
    });
  });

  describe("action methods", () => {
    it("should emit approvalResponse via sendApprovalResponse", () => {
      const handler = vi.fn();
      bus.on("approvalResponse", handler);

      adapter.sendApprovalResponse("req-1", true);

      expect(handler).toHaveBeenCalledWith({
        requestId: "req-1",
        approved: true,
      });
    });

    it("should emit approvalResponse with session approval", () => {
      const handler = vi.fn();
      bus.on("approvalResponse", handler);

      adapter.sendApprovalResponse("req-1", "session");

      expect(handler).toHaveBeenCalledWith({
        requestId: "req-1",
        approved: "session",
      });
    });

    it("should emit approvalResponse with denial and reason", () => {
      const handler = vi.fn();
      bus.on("approvalResponse", handler);

      adapter.sendApprovalResponse("req-1", false, "Too risky");

      expect(handler).toHaveBeenCalledWith({
        requestId: "req-1",
        approved: false,
        reason: "Too risky",
      });
    });

    it("should emit userInput via sendUserInput", () => {
      const handler = vi.fn();
      bus.on("userInput", handler);

      adapter.sendUserInput("input-1", "Hello");

      expect(handler).toHaveBeenCalledWith({
        requestId: "input-1",
        content: "Hello",
      });
    });

    it("should emit interrupt via sendInterrupt", () => {
      const handler = vi.fn();
      bus.on("interrupt", handler);

      adapter.sendInterrupt("User cancelled");

      expect(handler).toHaveBeenCalledWith({
        reason: "User cancelled",
      });
    });

    it("should emit getDiff via requestDiff", () => {
      const handler = vi.fn();
      bus.on("getDiff", handler);

      adapter.requestDiff("diff-1", "/src/test.ts");

      expect(handler).toHaveBeenCalledWith({
        requestId: "diff-1",
        path: "/src/test.ts",
      });
    });

    it("should emit manualToolInvoke via invokeManualTool", () => {
      const handler = vi.fn();
      bus.on("manualToolInvoke", handler);

      adapter.invokeManualTool("run_tests", { coverage: true });

      expect(handler).toHaveBeenCalledWith({
        toolName: "run_tests",
        args: { coverage: true },
      });
    });
  });

  describe("lifecycle", () => {
    it("should expose the bus", () => {
      expect(adapter.bus).toBe(bus);
    });

    it("should not double-initialize", async () => {
      // Already initialized in beforeEach
      await adapter.initialize();
      // Should not throw
    });

    it("should clean up subscriptions on shutdown", async () => {
      const handler = vi.fn();
      bus.on("message", handler);

      await adapter.shutdown();

      // Adapter's internal handlers should be cleaned up
      // But our test handler above should still work
      bus.emit("message", { message: { role: "user", content: "Test" } });
      expect(handler).toHaveBeenCalled();
    });
  });

  describe("trace levels", () => {
    let quietAdapter: EventCLIAdapter;

    beforeEach(async () => {
      // Shut down the default adapter before each trace level test
      await adapter.shutdown();
    });

    afterEach(async () => {
      if (quietAdapter) {
        await quietAdapter.shutdown();
      }
    });

    it("should only show assistant messages in quiet mode", async () => {
      quietAdapter = new EventCLIAdapter(bus, {
        input: streams.input,
        output: streams.output,
        enableRawMode: false,
        traceLevel: "quiet",
      });
      await quietAdapter.initialize();
      streams.clearOutput();

      // User message - should not show
      bus.emit("message", { message: { role: "user", content: "Hello" } });
      expect(streams.getOutput()).not.toContain("Hello");

      // Assistant message - should show (plain text, no box)
      bus.emit("message", { message: { role: "assistant", content: "Response" } });
      expect(streams.getOutput()).toContain("Response");
      expect(streams.getOutput()).not.toContain("Golem"); // No box title
    });

    it("should hide tool events in quiet mode", async () => {
      quietAdapter = new EventCLIAdapter(bus, {
        input: streams.input,
        output: streams.output,
        enableRawMode: false,
        traceLevel: "quiet",
      });
      await quietAdapter.initialize();
      streams.clearOutput();

      bus.emit("toolStarted", { toolCallId: "t1", toolName: "read_file", args: {} });
      bus.emit("toolResult", {
        toolCallId: "t1",
        toolName: "read_file",
        status: "success",
        durationMs: 10,
      });

      expect(streams.getOutput()).toBe("");
    });

    it("should hide worker updates in quiet mode", async () => {
      quietAdapter = new EventCLIAdapter(bus, {
        input: streams.input,
        output: streams.output,
        enableRawMode: false,
        traceLevel: "quiet",
      });
      await quietAdapter.initialize();
      streams.clearOutput();

      bus.emit("workerUpdate", {
        workerId: "w1",
        task: "Running task",
        status: "running",
        depth: 0,
      });

      expect(streams.getOutput()).toBe("");
    });

    it("should show tool errors at summary level", async () => {
      quietAdapter = new EventCLIAdapter(bus, {
        input: streams.input,
        output: streams.output,
        enableRawMode: false,
        traceLevel: "summary",
      });
      await quietAdapter.initialize();
      streams.clearOutput();

      bus.emit("toolResult", {
        toolCallId: "t1",
        toolName: "shell",
        status: "error",
        error: "Command failed",
        durationMs: 10,
      });

      expect(streams.getOutput()).toContain("shell");
      expect(streams.getOutput()).toContain("failed");
    });

    it("should always show errors even in quiet mode", async () => {
      quietAdapter = new EventCLIAdapter(bus, {
        input: streams.input,
        output: streams.output,
        enableRawMode: false,
        traceLevel: "quiet",
      });
      await quietAdapter.initialize();
      streams.clearOutput();

      bus.emit("status", { type: "error", message: "Critical error" });

      expect(streams.getOutput()).toContain("Critical error");
    });
  });
});

describe("parseToolCommand", () => {
  it("should return null for non-tool commands", () => {
    expect(parseToolCommand("hello")).toBeNull();
    expect(parseToolCommand("/help")).toBeNull();
    expect(parseToolCommand("tool foo")).toBeNull();
    expect(parseToolCommand("")).toBeNull();
  });

  it("should return null for empty tool name", () => {
    expect(parseToolCommand("/tool ")).toBeNull();
    expect(parseToolCommand("/tool   ")).toBeNull();
  });

  it("should parse basic tool name", () => {
    const result = parseToolCommand("/tool my_tool");
    expect(result).toEqual({ toolName: "my_tool", args: {} });
  });

  it("should parse tool with single argument", () => {
    const result = parseToolCommand("/tool read_file --path /src/test.ts");
    expect(result).toEqual({
      toolName: "read_file",
      args: { path: "/src/test.ts" },
    });
  });

  it("should parse tool with multiple arguments", () => {
    const result = parseToolCommand("/tool write_file --path /out.txt --content hello");
    expect(result).toEqual({
      toolName: "write_file",
      args: { path: "/out.txt", content: "hello" },
    });
  });

  it("should handle quoted string values", () => {
    const result = parseToolCommand('/tool shell --command "echo hello world"');
    expect(result).toEqual({
      toolName: "shell",
      args: { command: "echo hello world" },
    });
  });

  it("should handle single-quoted string values", () => {
    const result = parseToolCommand("/tool shell --command 'echo hello world'");
    expect(result).toEqual({
      toolName: "shell",
      args: { command: "echo hello world" },
    });
  });

  it("should parse JSON values", () => {
    const result = parseToolCommand('/tool config --enabled true --count 42');
    expect(result).toEqual({
      toolName: "config",
      args: { enabled: true, count: 42 },
    });
  });

  it("should handle flag-style arguments without values", () => {
    const result = parseToolCommand("/tool run_tests --verbose --coverage");
    expect(result).toEqual({
      toolName: "run_tests",
      args: { verbose: true, coverage: true },
    });
  });

  it("should ignore positional arguments after tool name", () => {
    const result = parseToolCommand("/tool read_file foo bar --path /test.ts");
    expect(result).toEqual({
      toolName: "read_file",
      args: { path: "/test.ts" },
    });
  });
});
