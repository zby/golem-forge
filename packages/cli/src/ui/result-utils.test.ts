/**
 * Tests for result utilities.
 */

import { describe, it, expect } from "vitest";
import {
  isToolResultValue,
  toTypedToolResult,
  isSuccessResult,
  isValidKind,
  isWellKnownKind,
  WELL_KNOWN_KINDS,
} from "./result-utils.js";

describe("WELL_KNOWN_KINDS", () => {
  it("contains all well-known kinds", () => {
    expect(WELL_KNOWN_KINDS).toContain("text");
    expect(WELL_KNOWN_KINDS).toContain("diff");
    expect(WELL_KNOWN_KINDS).toContain("file_content");
    expect(WELL_KNOWN_KINDS).toContain("file_list");
    expect(WELL_KNOWN_KINDS).toContain("json");
    expect(WELL_KNOWN_KINDS).toHaveLength(5);
  });
});

describe("isValidKind", () => {
  it("returns true for well-known kinds", () => {
    expect(isValidKind("text")).toBe(true);
    expect(isValidKind("diff")).toBe(true);
    expect(isValidKind("file_content")).toBe(true);
    expect(isValidKind("file_list")).toBe(true);
    expect(isValidKind("json")).toBe(true);
  });

  it("returns true for valid custom kinds with underscores", () => {
    expect(isValidKind("git_status")).toBe(true);
    expect(isValidKind("my_custom_type")).toBe(true);
  });

  it("returns true for valid custom kinds with dots (namespaced)", () => {
    expect(isValidKind("git.status")).toBe(true);
    expect(isValidKind("mycompany.report")).toBe(true);
    expect(isValidKind("a.b.c.d")).toBe(true);
  });

  it("returns true for valid custom kinds with numbers", () => {
    expect(isValidKind("test123")).toBe(true);
    expect(isValidKind("v2_result")).toBe(true);
  });

  it("returns false for kinds starting with uppercase", () => {
    expect(isValidKind("Text")).toBe(false);
    expect(isValidKind("GitStatus")).toBe(false);
  });

  it("returns false for kinds starting with numbers", () => {
    expect(isValidKind("123test")).toBe(false);
    expect(isValidKind("2fast")).toBe(false);
  });

  it("returns false for kinds with invalid characters", () => {
    expect(isValidKind("test-kind")).toBe(false);
    expect(isValidKind("test kind")).toBe(false);
    expect(isValidKind("test@kind")).toBe(false);
  });

  it("returns false for empty strings", () => {
    expect(isValidKind("")).toBe(false);
  });

  it("returns false for kinds with consecutive dots", () => {
    expect(isValidKind("a..b")).toBe(false);
  });

  it("returns false for kinds ending with dots", () => {
    expect(isValidKind("test.")).toBe(false);
  });

  it("returns false for kinds starting with dots", () => {
    expect(isValidKind(".test")).toBe(false);
  });
});

describe("isWellKnownKind", () => {
  it("returns true for well-known kinds", () => {
    expect(isWellKnownKind("text")).toBe(true);
    expect(isWellKnownKind("diff")).toBe(true);
    expect(isWellKnownKind("file_content")).toBe(true);
    expect(isWellKnownKind("file_list")).toBe(true);
    expect(isWellKnownKind("json")).toBe(true);
  });

  it("returns false for custom kinds", () => {
    expect(isWellKnownKind("git_status")).toBe(false);
    expect(isWellKnownKind("git.status")).toBe(false);
    expect(isWellKnownKind("custom")).toBe(false);
  });
});

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
    // Invalid kind format
    expect(isToolResultValue({ kind: "Invalid" })).toBe(false);
    expect(isToolResultValue({ kind: 123 })).toBe(false);
    expect(isToolResultValue({ kind: "test-kind" })).toBe(false);
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

  it("returns true for valid custom kinds", () => {
    expect(isToolResultValue({ kind: "git_status", data: { branch: "main" } })).toBe(true);
    expect(isToolResultValue({ kind: "git.status", data: { branch: "main" } })).toBe(true);
    expect(isToolResultValue({
      kind: "mycompany.custom_report",
      data: { foo: "bar" },
      summary: "Custom report",
    })).toBe(true);
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
