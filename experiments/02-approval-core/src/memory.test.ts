import { describe, it, expect, beforeEach } from "vitest";
import { ApprovalMemory } from "./memory.js";
import type { ApprovalDecision } from "./types.js";

describe("ApprovalMemory", () => {
  let memory: ApprovalMemory;

  beforeEach(() => {
    memory = new ApprovalMemory();
  });

  it("stores and retrieves approval decisions", () => {
    const decision: ApprovalDecision = {
      approved: true,
      remember: "session",
    };

    memory.store("write_file", { path: "/tmp/test.txt" }, decision);
    const cached = memory.lookup("write_file", { path: "/tmp/test.txt" });

    expect(cached).toEqual(decision);
  });

  it("returns undefined for uncached lookups", () => {
    const cached = memory.lookup("unknown_tool", {});
    expect(cached).toBeUndefined();
  });

  it("does not store decisions with remember=none", () => {
    const decision: ApprovalDecision = {
      approved: true,
      remember: "none",
    };

    memory.store("write_file", { path: "/tmp/test.txt" }, decision);
    const cached = memory.lookup("write_file", { path: "/tmp/test.txt" });

    expect(cached).toBeUndefined();
  });

  it("matches args with deep equality", () => {
    const decision: ApprovalDecision = {
      approved: true,
      remember: "session",
    };

    memory.store("tool", { a: 1, b: { c: 2 } }, decision);

    // Same structure, different object
    const cached = memory.lookup("tool", { a: 1, b: { c: 2 } });
    expect(cached).toEqual(decision);

    // Different args
    const notCached = memory.lookup("tool", { a: 1, b: { c: 3 } });
    expect(notCached).toBeUndefined();
  });

  it("clears all cached approvals", () => {
    const decision: ApprovalDecision = { approved: true, remember: "session" };

    memory.store("tool1", { x: 1 }, decision);
    memory.store("tool2", { y: 2 }, decision);

    expect(memory.size).toBe(2);

    memory.clear();

    expect(memory.size).toBe(0);
    expect(memory.lookup("tool1", { x: 1 })).toBeUndefined();
  });

  it("lists all cached approvals", () => {
    const decision1: ApprovalDecision = { approved: true, remember: "session" };
    const decision2: ApprovalDecision = { approved: false, remember: "session", note: "denied" };

    memory.store("tool1", { x: 1 }, decision1);
    memory.store("tool2", { y: 2 }, decision2);

    const approvals = memory.listApprovals();

    expect(approvals).toHaveLength(2);
    expect(approvals).toContainEqual({
      toolName: "tool1",
      toolArgs: { x: 1 },
      decision: decision1,
    });
    expect(approvals).toContainEqual({
      toolName: "tool2",
      toolArgs: { y: 2 },
      decision: decision2,
    });
  });

  it("handles args with different key order", () => {
    const decision: ApprovalDecision = { approved: true, remember: "session" };

    // Store with one key order
    memory.store("tool", { b: 2, a: 1 }, decision);

    // Lookup with different key order - should still match
    const cached = memory.lookup("tool", { a: 1, b: 2 });
    expect(cached).toEqual(decision);
  });
});
