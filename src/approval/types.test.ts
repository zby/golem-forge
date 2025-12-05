import { describe, it, expect } from "vitest";
import {
  ApprovalResult,
  supportsNeedsApproval,
  supportsApprovalDescription,
} from "./types.js";

describe("ApprovalResult", () => {
  it("creates blocked result with reason", () => {
    const result = ApprovalResult.blocked("Tool is disabled");
    expect(result.status).toBe("blocked");
    expect(result.blockReason).toBe("Tool is disabled");
    expect(result.isBlocked).toBe(true);
    expect(result.isPreApproved).toBe(false);
    expect(result.isNeedsApproval).toBe(false);
  });

  it("creates pre_approved result", () => {
    const result = ApprovalResult.preApproved();
    expect(result.status).toBe("pre_approved");
    expect(result.blockReason).toBeUndefined();
    expect(result.isBlocked).toBe(false);
    expect(result.isPreApproved).toBe(true);
    expect(result.isNeedsApproval).toBe(false);
  });

  it("creates needs_approval result", () => {
    const result = ApprovalResult.needsApproval();
    expect(result.status).toBe("needs_approval");
    expect(result.blockReason).toBeUndefined();
    expect(result.isBlocked).toBe(false);
    expect(result.isPreApproved).toBe(false);
    expect(result.isNeedsApproval).toBe(true);
  });
});

describe("Type guards", () => {
  it("supportsNeedsApproval detects interface", () => {
    const toolset = {
      needsApproval: () => ApprovalResult.preApproved(),
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
