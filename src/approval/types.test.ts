import { describe, it, expect } from "vitest";
import { BlockedError } from "./types.js";

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
