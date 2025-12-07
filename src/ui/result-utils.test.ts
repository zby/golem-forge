/**
 * Tests for result utilities.
 */

import { describe, it, expect } from "vitest";
import {
  isToolResultValue,
  toTypedToolResult,
  isSuccessResult,
} from "./result-utils.js";

describe("isToolResultValue", () => {
  it("returns false for null", () => {
    expect(isToolResultValue(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isToolResultValue(undefined)).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isToolResultValue("string")).toBe(false);
    expect(isToolResultValue(42)).toBe(false);
    expect(isToolResultValue(true)).toBe(false);
  });

  it("returns false for objects without kind", () => {
    expect(isToolResultValue({ data: "test" })).toBe(false);
    expect(isToolResultValue({})).toBe(false);
  });

  it("returns false for invalid kind values", () => {
    expect(isToolResultValue({ kind: "invalid" })).toBe(false);
    expect(isToolResultValue({ kind: 123 })).toBe(false);
  });

  it("returns true for text kind", () => {
    expect(isToolResultValue({ kind: "text", content: "hello" })).toBe(true);
  });

  it("returns true for diff kind", () => {
    expect(isToolResultValue({
      kind: "diff",
      path: "/test.txt",
      modified: "new content",
      isNew: true,
      bytesWritten: 11,
    })).toBe(true);
  });

  it("returns true for file_content kind", () => {
    expect(isToolResultValue({
      kind: "file_content",
      path: "/test.txt",
      content: "content",
      size: 7,
    })).toBe(true);
  });

  it("returns true for file_list kind", () => {
    expect(isToolResultValue({
      kind: "file_list",
      path: "/",
      files: ["a.txt", "b.txt"],
      count: 2,
    })).toBe(true);
  });

  it("returns true for json kind", () => {
    expect(isToolResultValue({ kind: "json", data: { foo: "bar" } })).toBe(true);
  });
});

describe("toTypedToolResult", () => {
  it("creates error result when isError is true", () => {
    const result = toTypedToolResult(
      "test_tool",
      "call-123",
      "Something went wrong",
      true,
      100
    );

    expect(result.status).toBe("error");
    expect(result.error).toBe("Something went wrong");
    expect(result.toolName).toBe("test_tool");
    expect(result.toolCallId).toBe("call-123");
    expect(result.durationMs).toBe(100);
  });

  it("extracts error from object with error field", () => {
    const result = toTypedToolResult(
      "test_tool",
      "call-123",
      { error: "Object error message" },
      true,
      50
    );

    expect(result.status).toBe("error");
    expect(result.error).toBe("Object error message");
  });

  it("preserves ToolResultValue as-is", () => {
    const diffResult = {
      kind: "diff" as const,
      path: "/test.txt",
      modified: "new content",
      isNew: true,
      bytesWritten: 11,
    };

    const result = toTypedToolResult(
      "write_file",
      "call-456",
      diffResult,
      false,
      200
    );

    expect(result.status).toBe("success");
    expect(result.value).toEqual(diffResult);
  });

  it("wraps non-structured output as JSON", () => {
    const output = { customField: "value", count: 42 };

    const result = toTypedToolResult(
      "custom_tool",
      "call-789",
      output,
      false,
      150
    );

    expect(result.status).toBe("success");
    expect(result.value).toEqual({
      kind: "json",
      data: output,
    });
  });

  it("handles legacy FilesystemToolResult with success: false", () => {
    const legacyResult = {
      success: false,
      error: "File not found",
      path: "/missing.txt",
    };

    const result = toTypedToolResult(
      "read_file",
      "call-001",
      legacyResult,
      false, // Note: isError is false, but legacy result has success: false
      50
    );

    expect(result.status).toBe("error");
    expect(result.error).toBe("File not found");
  });

  it("wraps legacy success result as JSON", () => {
    const legacyResult = {
      success: true,
      path: "/test.txt",
      content: "file content",
    };

    const result = toTypedToolResult(
      "read_file",
      "call-002",
      legacyResult,
      false,
      75
    );

    expect(result.status).toBe("success");
    expect(result.value?.kind).toBe("json");
  });
});

describe("isSuccessResult", () => {
  it("returns false for null", () => {
    expect(isSuccessResult(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isSuccessResult(undefined)).toBe(false);
  });

  it("returns false for primitives", () => {
    expect(isSuccessResult("string")).toBe(false);
    expect(isSuccessResult(42)).toBe(false);
  });

  it("returns true for TypedToolResult with success status", () => {
    expect(isSuccessResult({ status: "success", value: { kind: "text" } })).toBe(true);
  });

  it("returns false for TypedToolResult with error status", () => {
    expect(isSuccessResult({ status: "error", error: "failed" })).toBe(false);
  });

  it("returns true for legacy result with success: true", () => {
    expect(isSuccessResult({ success: true, data: "test" })).toBe(true);
  });

  it("returns false for legacy result with success: false", () => {
    expect(isSuccessResult({ success: false, error: "failed" })).toBe(false);
  });

  it("returns true for objects without status or success", () => {
    // Assume success if neither pattern matches
    expect(isSuccessResult({ data: "test" })).toBe(true);
  });
});
