import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  ApprovalController,
  ApprovalResult,
  type ApprovalRequest,
  type ApprovalDecision,
  type ApprovalCallback,
} from "../../../src/approval/index.js";
import { createAutoApprovalCallback } from "./cli-callback.js";
import {
  MockBrowserEnvironment,
  createBrowserApprovalCallback,
} from "./browser-callback.js";

// Shared test scenarios that should work identically across runtimes
const testRequest: ApprovalRequest = {
  toolName: "write_file",
  toolArgs: { path: "/tmp/test.txt", content: "Hello" },
  description: "Write to /tmp/test.txt",
};

describe("Multi-Runtime Approval", () => {
  describe("CLI Callback", () => {
    it("auto-approves when configured", async () => {
      const callback = createAutoApprovalCallback(true, "session");
      const decision = await callback(testRequest);

      expect(decision.approved).toBe(true);
      expect(decision.remember).toBe("session");
    });

    it("auto-denies when configured", async () => {
      const callback = createAutoApprovalCallback(false);
      const decision = await callback(testRequest);

      expect(decision.approved).toBe(false);
      expect(decision.note).toBe("Auto-denied");
    });

    it("works with ApprovalController", async () => {
      const callback = createAutoApprovalCallback(true);
      const controller = new ApprovalController({
        mode: "interactive",
        approvalCallback: callback,
      });

      const decision = await controller.requestApproval(testRequest);

      expect(decision.approved).toBe(true);
    });
  });

  describe("Browser Callback", () => {
    let env: MockBrowserEnvironment;

    beforeEach(() => {
      env = new MockBrowserEnvironment();
    });

    it("creates notification on approval request", async () => {
      env.setAutoResponse({ approved: true, remember: "session" });
      const callback = createBrowserApprovalCallback(env);

      await callback(testRequest);

      const notifications = env.getNotifications();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toContain("write_file");
      expect(notifications[0].message).toBe(testRequest.description);
    });

    it("resolves when user approves", async () => {
      const callback = createBrowserApprovalCallback(env);

      // Start the approval request
      const decisionPromise = callback(testRequest);

      // Simulate user clicking approve after small delay
      setTimeout(() => {
        const notifications = env.getNotifications();
        env.simulateUserResponse(notifications[0].id, true);
      }, 10);

      const decision = await decisionPromise;

      expect(decision.approved).toBe(true);
      expect(decision.remember).toBe("session");
    });

    it("resolves when user denies", async () => {
      const callback = createBrowserApprovalCallback(env);

      const decisionPromise = callback(testRequest);

      setTimeout(() => {
        const notifications = env.getNotifications();
        env.simulateUserResponse(notifications[0].id, false);
      }, 10);

      const decision = await decisionPromise;

      expect(decision.approved).toBe(false);
    });

    it("works with ApprovalController", async () => {
      env.setAutoResponse({ approved: true, remember: "session" });
      const callback = createBrowserApprovalCallback(env);
      const controller = new ApprovalController({
        mode: "interactive",
        approvalCallback: callback,
      });

      const decision = await controller.requestApproval(testRequest);

      expect(decision.approved).toBe(true);
    });

    it("handles multiple concurrent requests", async () => {
      const callback = createBrowserApprovalCallback(env);

      const request1: ApprovalRequest = {
        ...testRequest,
        toolName: "tool_1",
      };
      const request2: ApprovalRequest = {
        ...testRequest,
        toolName: "tool_2",
      };

      // Start both requests
      const promise1 = callback(request1);
      const promise2 = callback(request2);

      expect(env.getPendingCount()).toBe(2);

      // Respond to them in reverse order
      const notifications = env.getNotifications();
      env.simulateUserResponse(notifications[1].id, true); // tool_2
      env.simulateUserResponse(notifications[0].id, false); // tool_1

      const [decision1, decision2] = await Promise.all([promise1, promise2]);

      expect(decision1.approved).toBe(false);
      expect(decision2.approved).toBe(true);
    });
  });

  describe("Runtime Agnostic Behavior", () => {
    /**
     * These tests verify that both runtimes behave identically
     * when given the same inputs.
     */

    const runScenario = async (
      callback: ApprovalCallback,
      request: ApprovalRequest
    ): Promise<ApprovalDecision> => {
      const controller = new ApprovalController({
        mode: "interactive",
        approvalCallback: callback,
      });
      return controller.requestApproval(request);
    };

    it("both runtimes approve same request identically", async () => {
      // CLI
      const cliCallback = createAutoApprovalCallback(true, "session");
      const cliDecision = await runScenario(cliCallback, testRequest);

      // Browser
      const browserEnv = new MockBrowserEnvironment();
      browserEnv.setAutoResponse({ approved: true, remember: "session" });
      const browserCallback = createBrowserApprovalCallback(browserEnv);
      const browserDecision = await runScenario(browserCallback, testRequest);

      // Both should produce equivalent results
      expect(cliDecision.approved).toBe(browserDecision.approved);
      expect(cliDecision.remember).toBe(browserDecision.remember);
    });

    it("both runtimes deny same request identically", async () => {
      // CLI
      const cliCallback = createAutoApprovalCallback(false);
      const cliDecision = await runScenario(cliCallback, testRequest);

      // Browser
      const browserEnv = new MockBrowserEnvironment();
      browserEnv.setAutoResponse({ approved: false, remember: "none" });
      const browserCallback = createBrowserApprovalCallback(browserEnv);
      const browserDecision = await runScenario(browserCallback, testRequest);

      expect(cliDecision.approved).toBe(browserDecision.approved);
      expect(cliDecision.approved).toBe(false);
    });

    it("session caching works identically across runtimes", async () => {
      // Both runtimes with session caching
      const cliController = new ApprovalController({
        mode: "interactive",
        approvalCallback: createAutoApprovalCallback(true, "session"),
      });

      const browserEnv = new MockBrowserEnvironment();
      browserEnv.setAutoResponse({ approved: true, remember: "session" });
      const browserController = new ApprovalController({
        mode: "interactive",
        approvalCallback: createBrowserApprovalCallback(browserEnv),
      });

      // First request - both should call callback
      await cliController.requestApproval(testRequest);
      await browserController.requestApproval(testRequest);

      // Second identical request - both should use cache
      // We can verify by checking that browser didn't create new notification
      const notificationsBefore = browserEnv.getNotifications().length;

      await cliController.requestApproval(testRequest);
      await browserController.requestApproval(testRequest);

      const notificationsAfter = browserEnv.getNotifications().length;

      // No new notifications because cached
      expect(notificationsAfter).toBe(notificationsBefore);
    });

    it("core code has no runtime-specific dependencies", async () => {
      // This test verifies the architecture by checking that
      // ApprovalController accepts any ApprovalCallback

      const mockCallback: ApprovalCallback = async () => ({
        approved: true,
        remember: "none" as const,
      });

      // Should compile and work with any callback
      const controller = new ApprovalController({
        mode: "interactive",
        approvalCallback: mockCallback,
      });

      expect(controller).toBeDefined();

      // The controller wraps the callback but should invoke it
      const decision = await controller.requestApproval(testRequest);
      expect(decision.approved).toBe(true);
    });
  });
});
