import { describe, it, expect } from "vitest";
import {
  BlockedError,
  supportsNeedsApproval,
  supportsApprovalDescription,
} from "./types.js";

describe("BlockedError", () => {
  it("creates error with tool name and reason", () => {
    const error = new BlockedError("write_file", "Permission denied");
    expect(error.toolName).toBe("write_file");
    expect(error.reason).toBe("Permission denied");
    expect(error.message).toBe("Tool 'write_file' blocked: Permission denied");
    expect(error.name).toBe("BlockedError");
  });

  it("is an instance of Error", () => {
    const error = new BlockedError("read_file", "Access denied");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(BlockedError);
  });
});

describe("Type guards", () => {
  it("supportsNeedsApproval detects interface", () => {
    const toolset = {
      needsApproval: () => true,
    };
    expect(supportsNeedsApproval(toolset)).toBe(true);
  });

  it("supportsNeedsApproval works with boolean return", () => {
    const toolset = {
      needsApproval: () => false,
    };
    expect(supportsNeedsApproval(toolset)).toBe(true);
  });

  it("supportsNeedsApproval rejects non-matching objects", () => {
    expect(supportsNeedsApproval({})).toBe(false);
    expect(supportsNeedsApproval(null)).toBe(false);
    expect(supportsNeedsApproval({ needsApproval: "not a function" })).toBe(false);
  });

  it("supportsApprovalDescription detects interface", () => {
    const toolset = {
      getApprovalDescription: () => "Some description",
    };
    expect(supportsApprovalDescription(toolset)).toBe(true);
  });

  it("supportsApprovalDescription rejects non-matching objects", () => {
    expect(supportsApprovalDescription({})).toBe(false);
    expect(supportsApprovalDescription(null)).toBe(false);
  });
});
