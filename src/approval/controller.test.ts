import { describe, it, expect, vi, beforeEach } from "vitest";
import { ApprovalController } from "./controller.js";
import type { ApprovalRequest, ApprovalDecision } from "./types.js";

describe("ApprovalController", () => {
  const testRequest: ApprovalRequest = {
    toolName: "write_file",
    toolArgs: { path: "/tmp/test.txt" },
    description: "Write to /tmp/test.txt",
  };

  describe("approve_all mode", () => {
    it("auto-approves all requests", async () => {
      const controller = new ApprovalController({ mode: "approve_all" });
      const decision = await controller.requestApproval(testRequest);

      expect(decision.approved).toBe(true);
    });

    it("returns callback that auto-approves", async () => {
      const controller = new ApprovalController({ mode: "approve_all" });
      const callback = controller.getCallback();
      const decision = await callback(testRequest);

      expect(decision.approved).toBe(true);
    });
  });

  describe("auto_deny mode", () => {
    it("auto-denies all requests", async () => {
      const controller = new ApprovalController({ mode: "auto_deny" });
      const decision = await controller.requestApproval(testRequest);

      expect(decision.approved).toBe(false);
      expect(decision.note).toContain("Auto-deny mode");
    });

    it("returns callback that auto-denies", async () => {
      const controller = new ApprovalController({ mode: "auto_deny" });
      const callback = controller.getCallback();
      const decision = await callback(testRequest);

      expect(decision.approved).toBe(false);
    });
  });

  describe("interactive mode", () => {
    it("throws if no callback provided", () => {
      expect(() => {
        new ApprovalController({ mode: "interactive" });
      }).toThrow('requires an approvalCallback');
    });

    it("calls the approval callback", async () => {
      const mockCallback = vi.fn().mockResolvedValue({
        approved: true,
        remember: "none",
      } as ApprovalDecision);

      const controller = new ApprovalController({
        mode: "interactive",
        approvalCallback: mockCallback,
      });

      const decision = await controller.requestApproval(testRequest);

      expect(mockCallback).toHaveBeenCalledWith(testRequest);
      expect(decision.approved).toBe(true);
    });

    it("caches approved decisions with remember=session", async () => {
      const mockCallback = vi.fn().mockResolvedValue({
        approved: true,
        remember: "session",
      } as ApprovalDecision);

      const controller = new ApprovalController({
        mode: "interactive",
        approvalCallback: mockCallback,
      });

      // First request - calls callback
      await controller.requestApproval(testRequest);
      expect(mockCallback).toHaveBeenCalledTimes(1);

      // Second identical request - uses cache
      await controller.requestApproval(testRequest);
      expect(mockCallback).toHaveBeenCalledTimes(1); // Still 1, not called again
    });

    it("does not cache decisions with remember=none", async () => {
      const mockCallback = vi.fn().mockResolvedValue({
        approved: true,
        remember: "none",
      } as ApprovalDecision);

      const controller = new ApprovalController({
        mode: "interactive",
        approvalCallback: mockCallback,
      });

      // First request
      await controller.requestApproval(testRequest);
      expect(mockCallback).toHaveBeenCalledTimes(1);

      // Second request - not cached, calls again
      await controller.requestApproval(testRequest);
      expect(mockCallback).toHaveBeenCalledTimes(2);
    });
  });

  describe("session management", () => {
    it("isSessionApproved returns true for cached approvals", async () => {
      const controller = new ApprovalController({
        mode: "interactive",
        approvalCallback: async () => ({ approved: true, remember: "session" }),
      });

      expect(controller.isSessionApproved(testRequest)).toBe(false);

      await controller.requestApproval(testRequest);

      expect(controller.isSessionApproved(testRequest)).toBe(true);
    });

    it("clearSessionApprovals removes cached decisions", async () => {
      const controller = new ApprovalController({
        mode: "interactive",
        approvalCallback: async () => ({ approved: true, remember: "session" }),
      });

      await controller.requestApproval(testRequest);
      expect(controller.isSessionApproved(testRequest)).toBe(true);

      controller.clearSessionApprovals();
      expect(controller.isSessionApproved(testRequest)).toBe(false);
    });
  });

  describe("getCallback", () => {
    it("throws in interactive mode without callback at construction", () => {
      expect(() => {
        new ApprovalController({ mode: "interactive" });
      }).toThrow('requires an approvalCallback');
    });

    it("returns wrapped callback that includes caching", async () => {
      const mockCallback = vi.fn().mockResolvedValue({
        approved: true,
        remember: "session",
      } as ApprovalDecision);

      const controller = new ApprovalController({
        mode: "interactive",
        approvalCallback: mockCallback,
      });

      const callback = controller.getCallback();

      // First call
      await callback(testRequest);
      expect(mockCallback).toHaveBeenCalledTimes(1);

      // Second call - should use cache via controller
      await callback(testRequest);
      expect(mockCallback).toHaveBeenCalledTimes(1);
    });
  });
});
