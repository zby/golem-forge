/**
 * Browser Extension Approval Callback
 *
 * Implements ApprovalCallback for browser extensions.
 * This module provides:
 * 1. A mock implementation for testing without a real browser
 * 2. Types/patterns for real Chrome extension implementation
 */

import type {
  ApprovalCallback,
  ApprovalRequest,
  ApprovalDecision,
} from "../../../src/approval/index.js";

/**
 * Mock Chrome notification API for testing
 */
interface MockChromeNotification {
  id: string;
  type: "basic";
  title: string;
  message: string;
  buttons: Array<{ title: string }>;
}

/**
 * Mock Chrome message for testing
 */
interface ApprovalMessage {
  type: "approval_request" | "approval_response";
  requestId: string;
  request?: ApprovalRequest;
  decision?: ApprovalDecision;
}

/**
 * Simulated browser environment for testing.
 * In a real extension, this would be the actual chrome.* APIs.
 */
export class MockBrowserEnvironment {
  private pendingRequests: Map<
    string,
    {
      request: ApprovalRequest;
      resolve: (decision: ApprovalDecision) => void;
    }
  > = new Map();

  private notificationLog: MockChromeNotification[] = [];
  private autoResponse: ApprovalDecision | null = null;
  private responseDelay: number = 0;

  /**
   * Configure automatic responses for testing
   */
  setAutoResponse(decision: ApprovalDecision | null, delayMs: number = 0): void {
    this.autoResponse = decision;
    this.responseDelay = delayMs;
  }

  /**
   * Get logged notifications (for testing)
   */
  getNotifications(): MockChromeNotification[] {
    return [...this.notificationLog];
  }

  /**
   * Simulate user clicking a notification button
   */
  simulateUserResponse(requestId: string, approved: boolean): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      pending.resolve({
        approved,
        remember: approved ? "session" : "none",
        note: approved ? undefined : "User denied via popup",
      });
      this.pendingRequests.delete(requestId);
    }
  }

  /**
   * Create notification (mock chrome.notifications.create)
   */
  createNotification(notification: MockChromeNotification): void {
    this.notificationLog.push(notification);

    // Auto-respond if configured
    if (this.autoResponse) {
      setTimeout(() => {
        this.simulateUserResponse(notification.id, this.autoResponse!.approved);
      }, this.responseDelay);
    }
  }

  /**
   * Register a pending approval request
   */
  registerPendingRequest(
    requestId: string,
    request: ApprovalRequest,
    resolve: (decision: ApprovalDecision) => void
  ): void {
    this.pendingRequests.set(requestId, { request, resolve });
  }

  /**
   * Get pending request count (for testing)
   */
  getPendingCount(): number {
    return this.pendingRequests.size;
  }
}

/**
 * Create a browser extension approval callback.
 *
 * In a real extension, this would:
 * 1. Send message to popup/content script
 * 2. Show notification or popup UI
 * 3. Wait for user response via message passing
 *
 * This mock version simulates that flow for testing.
 */
export function createBrowserApprovalCallback(
  env: MockBrowserEnvironment
): ApprovalCallback {
  let requestCounter = 0;

  return async (request: ApprovalRequest): Promise<ApprovalDecision> => {
    const requestId = `approval_${++requestCounter}_${Date.now()}`;

    return new Promise((resolve) => {
      // Register the pending request
      env.registerPendingRequest(requestId, request, resolve);

      // Create notification (simulates chrome.notifications.create)
      env.createNotification({
        id: requestId,
        type: "basic",
        title: `Approve: ${request.toolName}`,
        message: request.description,
        buttons: [{ title: "Approve" }, { title: "Deny" }],
      });
    });
  };
}

/**
 * Real Chrome extension callback pattern (for documentation).
 *
 * This is how a real implementation would look:
 *
 * ```typescript
 * function createChromeApprovalCallback(): ApprovalCallback {
 *   return async (request: ApprovalRequest): Promise<ApprovalDecision> => {
 *     return new Promise((resolve) => {
 *       const requestId = crypto.randomUUID();
 *
 *       // Store pending request
 *       chrome.storage.local.set({
 *         [`pending_${requestId}`]: { request, timestamp: Date.now() }
 *       });
 *
 *       // Show notification
 *       chrome.notifications.create(requestId, {
 *         type: 'basic',
 *         iconUrl: 'icon.png',
 *         title: `Approve: ${request.toolName}`,
 *         message: request.description,
 *         buttons: [{ title: 'Approve' }, { title: 'Deny' }]
 *       });
 *
 *       // Listen for button click
 *       const listener = (notifId: string, buttonIndex: number) => {
 *         if (notifId === requestId) {
 *           chrome.notifications.onButtonClicked.removeListener(listener);
 *           chrome.storage.local.remove(`pending_${requestId}`);
 *
 *           resolve({
 *             approved: buttonIndex === 0,
 *             remember: buttonIndex === 0 ? 'session' : 'none'
 *           });
 *         }
 *       };
 *
 *       chrome.notifications.onButtonClicked.addListener(listener);
 *     });
 *   };
 * }
 * ```
 */
