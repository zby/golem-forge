/**
 * Tests for CLIAdapter
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Writable, Readable, PassThrough } from "stream";
import { CLIAdapter } from "./cli-adapter.js";
import type {
  Message,
  TaskProgress,
  StatusUpdate,
  TypedToolResult,
  DiffSummary,
} from "./types.js";

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a writable stream that captures output.
 */
function createCaptureStream(): { stream: Writable; getOutput: () => string } {
  let output = "";
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  return { stream, getOutput: () => output };
}

/**
 * Create an input stream that provides predetermined answers.
 * Each call to readline.question will consume the next answer.
 */
function createAnswerStream(answers: string[]): Readable {
  const stream = new PassThrough();
  // Queue answers to be sent when readline asks
  let answerIndex = 0;

  // Provide answers with slight delay to ensure readline is ready
  const sendNextAnswer = (): void => {
    if (answerIndex < answers.length) {
      stream.push(answers[answerIndex] + "\n");
      answerIndex++;
    }
  };

  // Send first answer immediately, subsequent on demand
  setImmediate(sendNextAnswer);

  // Expose method to trigger next answer
  (stream as PassThrough & { triggerNext: () => void }).triggerNext = sendNextAnswer;

  return stream;
}

/**
 * Strip ANSI color codes from string for easier assertions.
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

// ============================================================================
// Tests
// ============================================================================

describe("CLIAdapter", () => {
  let adapter: CLIAdapter;
  let captureStream: ReturnType<typeof createCaptureStream>;

  beforeEach(() => {
    captureStream = createCaptureStream();
  });

  afterEach(async () => {
    if (adapter) {
      await adapter.shutdown();
    }
  });

  describe("displayMessage", () => {
    it("should display user message with 'You' prefix", async () => {
      adapter = new CLIAdapter({
        input: new PassThrough(),
        output: captureStream.stream,
        enableRawMode: false,
      });
      await adapter.initialize();

      const msg: Message = { role: "user", content: "Hello world" };
      await adapter.displayMessage(msg);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("You");
      expect(output).toContain("Hello world");
    });

    it("should display assistant message in a box with 'Golem' title", async () => {
      adapter = new CLIAdapter({
        input: new PassThrough(),
        output: captureStream.stream,
        enableRawMode: false,
      });
      await adapter.initialize();

      const msg: Message = { role: "assistant", content: "I can help" };
      await adapter.displayMessage(msg);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("Golem");
      expect(output).toContain("I can help");
    });

    it("should display system message with [System] prefix", async () => {
      adapter = new CLIAdapter({
        input: new PassThrough(),
        output: captureStream.stream,
        enableRawMode: false,
      });
      await adapter.initialize();

      const msg: Message = { role: "system", content: "System notice" };
      await adapter.displayMessage(msg);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("[System]");
      expect(output).toContain("System notice");
    });
  });

  describe("showProgress", () => {
    beforeEach(async () => {
      adapter = new CLIAdapter({
        input: new PassThrough(),
        output: captureStream.stream,
        enableRawMode: false,
      });
      await adapter.initialize();
    });

    it("should show checkmark for complete status", () => {
      const task: TaskProgress = {
        id: "1",
        description: "Task done",
        status: "complete",
        depth: 0,
      };
      adapter.showProgress(task);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("✓");
      expect(output).toContain("Task done");
    });

    it("should show dot for running status", () => {
      const task: TaskProgress = {
        id: "2",
        description: "Task running",
        status: "running",
        depth: 0,
      };
      adapter.showProgress(task);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("●");
      expect(output).toContain("Task running");
    });

    it("should show X for error status", () => {
      const task: TaskProgress = {
        id: "3",
        description: "Task failed",
        status: "error",
        depth: 0,
      };
      adapter.showProgress(task);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("✗");
      expect(output).toContain("Task failed");
    });

    it("should show circle for pending status", () => {
      const task: TaskProgress = {
        id: "4",
        description: "Task pending",
        status: "pending",
        depth: 0,
      };
      adapter.showProgress(task);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("○");
      expect(output).toContain("Task pending");
    });

    it("should indent based on depth", () => {
      const task: TaskProgress = {
        id: "5",
        description: "Nested task",
        status: "running",
        depth: 2,
      };
      adapter.showProgress(task);

      const output = captureStream.getOutput();
      // Depth 2 = 4 spaces of indentation
      expect(output).toMatch(/^ {4}/);
    });
  });

  describe("updateStatus", () => {
    beforeEach(async () => {
      adapter = new CLIAdapter({
        input: new PassThrough(),
        output: captureStream.stream,
        enableRawMode: false,
      });
      await adapter.initialize();
    });

    it("should show info icon for info type", () => {
      const status: StatusUpdate = { type: "info", message: "Information" };
      adapter.updateStatus(status);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("ℹ");
      expect(output).toContain("Information");
    });

    it("should show warning icon for warning type", () => {
      const status: StatusUpdate = { type: "warning", message: "Warning message" };
      adapter.updateStatus(status);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("⚠");
      expect(output).toContain("Warning message");
    });

    it("should show error icon for error type", () => {
      const status: StatusUpdate = { type: "error", message: "Error occurred" };
      adapter.updateStatus(status);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("✗");
      expect(output).toContain("Error occurred");
    });
  });

  describe("displayToolResult", () => {
    beforeEach(async () => {
      adapter = new CLIAdapter({
        input: new PassThrough(),
        output: captureStream.stream,
        enableRawMode: false,
      });
      await adapter.initialize();
    });

    it("should display error status with failure message", async () => {
      const result: TypedToolResult = {
        toolName: "read_file",
        status: "error",
        error: "File not found",
        durationMs: 10,
      };
      await adapter.displayToolResult(result);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("✗");
      expect(output).toContain("read_file");
      expect(output).toContain("failed");
      expect(output).toContain("File not found");
    });

    it("should display interrupted status", async () => {
      const result: TypedToolResult = {
        toolName: "long_task",
        status: "interrupted",
        durationMs: 5000,
      };
      await adapter.displayToolResult(result);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("⚠");
      expect(output).toContain("long_task");
      expect(output).toContain("interrupted");
    });

    it("should display success with no value", async () => {
      const result: TypedToolResult = {
        toolName: "delete_file",
        status: "success",
        durationMs: 15,
      };
      await adapter.displayToolResult(result);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("✓");
      expect(output).toContain("delete_file");
      expect(output).toContain("15ms");
    });

    it("should display text result", async () => {
      const result: TypedToolResult = {
        toolName: "echo",
        status: "success",
        durationMs: 5,
        value: { kind: "text", content: "Hello from echo" },
      };
      await adapter.displayToolResult(result);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("✓");
      expect(output).toContain("echo");
      expect(output).toContain("Hello from echo");
    });

    it("should truncate long text content", async () => {
      const longContent = "x".repeat(600);
      const result: TypedToolResult = {
        toolName: "read",
        status: "success",
        durationMs: 10,
        value: { kind: "text", content: longContent },
      };
      await adapter.displayToolResult(result);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("more chars");
      expect(output.length).toBeLessThan(longContent.length);
    });

    it("should display file content result with path and size", async () => {
      const result: TypedToolResult = {
        toolName: "read_file",
        status: "success",
        durationMs: 20,
        value: {
          kind: "file_content",
          path: "/tmp/test.txt",
          content: "file contents here",
          size: 18,
        },
      };
      await adapter.displayToolResult(result);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("✓");
      expect(output).toContain("read_file");
      expect(output).toContain("/tmp/test.txt");
      expect(output).toContain("18 bytes");
      expect(output).toContain("file contents here");
    });

    it("should display file list result with count", async () => {
      const result: TypedToolResult = {
        toolName: "list_dir",
        status: "success",
        durationMs: 30,
        value: {
          kind: "file_list",
          path: "/tmp",
          files: ["a.txt", "b.txt", "c.txt"],
          count: 3,
        },
      };
      await adapter.displayToolResult(result);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("✓");
      expect(output).toContain("list_dir");
      expect(output).toContain("/tmp");
      expect(output).toContain("3 entries");
      expect(output).toContain("a.txt");
      expect(output).toContain("b.txt");
      expect(output).toContain("c.txt");
    });

    it("should truncate long file lists", async () => {
      const files = Array.from({ length: 30 }, (_, i) => `file${i}.txt`);
      const result: TypedToolResult = {
        toolName: "list_dir",
        status: "success",
        durationMs: 30,
        value: {
          kind: "file_list",
          path: "/tmp",
          files,
          count: 30,
        },
      };
      await adapter.displayToolResult(result);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("30 entries");
      expect(output).toContain("and 10 more");
      // Should show first 20
      expect(output).toContain("file0.txt");
      expect(output).toContain("file19.txt");
      // Should not show file20+
      expect(output).not.toContain("file20.txt");
    });

    it("should display JSON result with summary", async () => {
      const result: TypedToolResult = {
        toolName: "api_call",
        status: "success",
        durationMs: 100,
        value: {
          kind: "json",
          data: { status: "ok", count: 42 },
          summary: "API response",
        },
      };
      await adapter.displayToolResult(result);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("✓");
      expect(output).toContain("api_call");
      expect(output).toContain("API response");
      expect(output).toContain('"status": "ok"');
      expect(output).toContain('"count": 42');
    });

    it("should display diff result with path and summary", async () => {
      const result: TypedToolResult = {
        toolName: "write_file",
        status: "success",
        durationMs: 25,
        value: {
          kind: "diff",
          path: "/tmp/modified.txt",
          original: "old content",
          modified: "new content",
          isNew: false,
          bytesWritten: 11,
        },
      };
      await adapter.displayToolResult(result);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("✓");
      expect(output).toContain("write_file");
      expect(output).toContain("MODIFIED");
      expect(output).toContain("/tmp/modified.txt");
      expect(output).toContain("11 bytes");
    });

    it("should display new file diff result", async () => {
      const result: TypedToolResult = {
        toolName: "write_file",
        status: "success",
        durationMs: 20,
        value: {
          kind: "diff",
          path: "/tmp/new.txt",
          original: "",
          modified: "brand new file",
          isNew: true,
          bytesWritten: 14,
        },
      };
      await adapter.displayToolResult(result);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("NEW");
      expect(output).toContain("/tmp/new.txt");
    });
  });

  describe("displayDiffSummary", () => {
    beforeEach(async () => {
      adapter = new CLIAdapter({
        input: new PassThrough(),
        output: captureStream.stream,
        enableRawMode: false,
      });
      await adapter.initialize();
    });

    it("should display 'No changes' for empty summaries", async () => {
      await adapter.displayDiffSummary([]);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("No changes");
    });

    it("should display create operation with A symbol", async () => {
      const summaries: DiffSummary[] = [
        { path: "new.txt", operation: "create", additions: 10, deletions: 0 },
      ];
      await adapter.displayDiffSummary(summaries);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("A");
      expect(output).toContain("new.txt");
      expect(output).toContain("+10");
    });

    it("should display update operation with M symbol", async () => {
      const summaries: DiffSummary[] = [
        { path: "modified.txt", operation: "update", additions: 5, deletions: 3 },
      ];
      await adapter.displayDiffSummary(summaries);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("M");
      expect(output).toContain("modified.txt");
      expect(output).toContain("+5");
      expect(output).toContain("-3");
    });

    it("should display delete operation with D symbol", async () => {
      const summaries: DiffSummary[] = [
        { path: "deleted.txt", operation: "delete", additions: 0, deletions: 20 },
      ];
      await adapter.displayDiffSummary(summaries);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("D");
      expect(output).toContain("deleted.txt");
      expect(output).toContain("-20");
    });

    it("should display '(modified)' for unknown stats (-1)", async () => {
      const summaries: DiffSummary[] = [
        { path: "unknown.txt", operation: "update", additions: -1, deletions: -1 },
      ];
      await adapter.displayDiffSummary(summaries);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("(modified)");
    });

    it("should display '(no changes)' for zero additions and deletions", async () => {
      const summaries: DiffSummary[] = [
        { path: "same.txt", operation: "update", additions: 0, deletions: 0 },
      ];
      await adapter.displayDiffSummary(summaries);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("(no changes)");
    });
  });

  describe("displayManualTools", () => {
    beforeEach(async () => {
      adapter = new CLIAdapter({
        input: new PassThrough(),
        output: captureStream.stream,
        enableRawMode: false,
      });
      await adapter.initialize();
    });

    it("should display tools grouped by category", () => {
      adapter.displayManualTools([
        { name: "read", description: "Read a file", category: "File" },
        { name: "write", description: "Write a file", category: "File" },
        { name: "search", description: "Search code", category: "Search" },
      ]);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("Available manual tools");
      expect(output).toContain("File");
      expect(output).toContain("read");
      expect(output).toContain("write");
      expect(output).toContain("Search");
      expect(output).toContain("search");
    });

    it("should use 'General' category for tools without category", () => {
      adapter.displayManualTools([
        { name: "misc", description: "Miscellaneous tool" },
      ]);

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("General");
      expect(output).toContain("misc");
    });
  });

  describe("getUserInput", () => {
    it("should throw if not initialized", async () => {
      adapter = new CLIAdapter({
        input: new PassThrough(),
        output: captureStream.stream,
        enableRawMode: false,
      });

      await expect(adapter.getUserInput()).rejects.toThrow("not initialized");
    });
  });

  describe("requestApproval", () => {
    it("should throw if not initialized", async () => {
      adapter = new CLIAdapter({
        input: new PassThrough(),
        output: captureStream.stream,
        enableRawMode: false,
      });

      await expect(
        adapter.requestApproval({
          type: "tool",
          description: "Test",
          risk: "low",
          workerPath: [{ task: "test", workerId: "1" }],
        })
      ).rejects.toThrow("not initialized");
    });

    it("should display approval request details", async () => {
      const inputStream = createAnswerStream(["y"]);
      adapter = new CLIAdapter({
        input: inputStream,
        output: captureStream.stream,
        enableRawMode: false,
      });
      await adapter.initialize();

      await adapter.requestApproval({
        type: "file_write",
        description: "Write to config.json",
        risk: "medium",
        workerPath: [{ task: "update config", workerId: "1" }],
        details: { path: "/etc/config.json" },
      });

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("APPROVAL REQUIRED");
      expect(output).toContain("file_write");
      expect(output).toContain("Write to config.json");
      expect(output).toContain("medium");
      expect(output).toContain("path");
      expect(output).toContain("/etc/config.json");
    });

    it("should display worker path when multiple workers", async () => {
      const inputStream = createAnswerStream(["n"]);
      adapter = new CLIAdapter({
        input: inputStream,
        output: captureStream.stream,
        enableRawMode: false,
      });
      await adapter.initialize();

      await adapter.requestApproval({
        type: "shell",
        description: "Run command",
        risk: "high",
        workerPath: [
          { task: "main task", workerId: "1" },
          { task: "subtask", workerId: "2" },
        ],
      });

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("Path");
      expect(output).toContain("main task");
      expect(output).toContain("subtask");
    });

    it("should return approved:true for 'y' answer", async () => {
      const inputStream = createAnswerStream(["y"]);
      adapter = new CLIAdapter({
        input: inputStream,
        output: captureStream.stream,
        enableRawMode: false,
      });
      await adapter.initialize();

      const result = await adapter.requestApproval({
        type: "tool",
        description: "Test",
        risk: "low",
        workerPath: [{ task: "test", workerId: "1" }],
      });

      expect(result).toEqual({ approved: true });
    });

    it("should return approved:true for 'yes' answer", async () => {
      const inputStream = createAnswerStream(["yes"]);
      adapter = new CLIAdapter({
        input: inputStream,
        output: captureStream.stream,
        enableRawMode: false,
      });
      await adapter.initialize();

      const result = await adapter.requestApproval({
        type: "tool",
        description: "Test",
        risk: "low",
        workerPath: [{ task: "test", workerId: "1" }],
      });

      expect(result).toEqual({ approved: true });
    });

    it("should return approved:false for 'n' answer", async () => {
      const inputStream = createAnswerStream(["n"]);
      adapter = new CLIAdapter({
        input: inputStream,
        output: captureStream.stream,
        enableRawMode: false,
      });
      await adapter.initialize();

      const result = await adapter.requestApproval({
        type: "tool",
        description: "Test",
        risk: "low",
        workerPath: [{ task: "test", workerId: "1" }],
      });

      expect(result).toEqual({ approved: false });
    });

    it("should return approved:false for empty answer", async () => {
      const inputStream = createAnswerStream([""]);
      adapter = new CLIAdapter({
        input: inputStream,
        output: captureStream.stream,
        enableRawMode: false,
      });
      await adapter.initialize();

      const result = await adapter.requestApproval({
        type: "tool",
        description: "Test",
        risk: "low",
        workerPath: [{ task: "test", workerId: "1" }],
      });

      expect(result).toEqual({ approved: false });
    });

    it("should return approved:'always' for 'a' answer", async () => {
      const inputStream = createAnswerStream(["a"]);
      adapter = new CLIAdapter({
        input: inputStream,
        output: captureStream.stream,
        enableRawMode: false,
      });
      await adapter.initialize();

      const result = await adapter.requestApproval({
        type: "tool",
        description: "Test",
        risk: "low",
        workerPath: [{ task: "test", workerId: "1" }],
      });

      expect(result).toEqual({ approved: "always" });
    });

    it("should return approved:'session' for 's' answer", async () => {
      const inputStream = createAnswerStream(["s"]);
      adapter = new CLIAdapter({
        input: inputStream,
        output: captureStream.stream,
        enableRawMode: false,
      });
      await adapter.initialize();

      const result = await adapter.requestApproval({
        type: "tool",
        description: "Test",
        risk: "low",
        workerPath: [{ task: "test", workerId: "1" }],
      });

      expect(result).toEqual({ approved: "session" });
    });

    it("should return approved:false for unknown answer", async () => {
      const inputStream = createAnswerStream(["xyz"]);
      adapter = new CLIAdapter({
        input: inputStream,
        output: captureStream.stream,
        enableRawMode: false,
      });
      await adapter.initialize();

      const result = await adapter.requestApproval({
        type: "tool",
        description: "Test",
        risk: "low",
        workerPath: [{ task: "test", workerId: "1" }],
      });

      expect(result).toEqual({ approved: false });
      expect(stripAnsi(captureStream.getOutput())).toContain("Unknown response");
    });
  });

  describe("executeManualTool", () => {
    beforeEach(async () => {
      adapter = new CLIAdapter({
        input: new PassThrough(),
        output: captureStream.stream,
        enableRawMode: false,
      });
      await adapter.initialize();
    });

    it("should show error when no handler registered", async () => {
      await adapter.executeManualTool("test", {});

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("No manual tool handler registered");
    });

    it("should display success result", async () => {
      adapter.onManualToolRequest(async () => ({
        success: true,
        result: { value: 42 },
      }));

      await adapter.executeManualTool("calculate", { x: 1 });

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("✓");
      expect(output).toContain("calculate completed");
      expect(output).toContain("value");
      expect(output).toContain("42");
    });

    it("should display failure result", async () => {
      adapter.onManualToolRequest(async () => ({
        success: false,
        error: "Invalid arguments",
      }));

      await adapter.executeManualTool("bad_tool", {});

      const output = stripAnsi(captureStream.getOutput());
      expect(output).toContain("✗");
      expect(output).toContain("bad_tool failed");
      expect(output).toContain("Invalid arguments");
    });
  });

  describe("lifecycle", () => {
    it("should allow multiple initialize calls (idempotent)", async () => {
      adapter = new CLIAdapter({
        input: new PassThrough(),
        output: captureStream.stream,
        enableRawMode: false,
      });

      await adapter.initialize();
      await adapter.initialize(); // Should not throw

      // Should still work
      const msg: Message = { role: "user", content: "test" };
      await adapter.displayMessage(msg);
      expect(stripAnsi(captureStream.getOutput())).toContain("test");
    });

    it("should allow shutdown without initialize", async () => {
      adapter = new CLIAdapter({
        input: new PassThrough(),
        output: captureStream.stream,
        enableRawMode: false,
      });

      // Should not throw
      await adapter.shutdown();
    });
  });
});
