/**
 * ApprovalController for mode-based approval handling.
 *
 * This module provides ApprovalController, which manages approval modes
 * and provides consistent approval handling across different runtimes.
 */

import { ApprovalMemory } from "./memory.js";
import type { ApprovalCallback, ApprovalDecision, ApprovalRequest } from "./types.js";

/**
 * Approval mode determines how requests are handled.
 *
 * - **interactive**: Prompts user via callback (blocks until decision)
 * - **approve_all**: Auto-approves all requests (for testing)
 * - **strict**: Auto-denies all requests (for CI/production safety)
 */
export type ApprovalMode = "interactive" | "approve_all" | "strict";

/**
 * Options for creating an ApprovalController.
 */
export interface ApprovalControllerOptions {
  /** Runtime mode for approval handling */
  mode?: ApprovalMode;
  /** Callback for prompting user (required for interactive mode) */
  approvalCallback?: ApprovalCallback;
}

/**
 * Manages approval mode and provides prompt functions.
 *
 * This controller provides mode-based approval handling:
 *
 * - **interactive**: Prompts user via callback (blocks until decision)
 * - **approve_all**: Auto-approves all requests (for testing)
 * - **strict**: Auto-denies all requests (for CI/production safety)
 *
 * @example
 * ```typescript
 * // Auto-approve everything (for tests)
 * const controller = new ApprovalController({ mode: "approve_all" });
 *
 * // Reject everything (for CI/production)
 * const controller = new ApprovalController({ mode: "strict" });
 *
 * // Interactive mode with custom callback
 * const controller = new ApprovalController({
 *   mode: "interactive",
 *   approvalCallback: async (request) => {
 *     // Show UI, get user input
 *     const approved = await showApprovalDialog(request);
 *     return { approved, remember: "session" };
 *   }
 * });
 * ```
 */
export class ApprovalController {
  readonly mode: ApprovalMode;
  private readonly _approvalCallback?: ApprovalCallback;
  private readonly _memory: ApprovalMemory;

  constructor(options: ApprovalControllerOptions = {}) {
    this.mode = options.mode ?? "interactive";
    this._approvalCallback = options.approvalCallback;
    this._memory = new ApprovalMemory();
  }

  /**
   * Get the session memory for caching approvals.
   */
  get memory(): ApprovalMemory {
    return this._memory;
  }

  /**
   * Check if this request is already approved for the session.
   *
   * @param request - The approval request to check
   * @returns True if a matching approval is cached, false otherwise
   */
  isSessionApproved(request: ApprovalRequest): boolean {
    const cached = this._memory.lookup(request.toolName, request.toolArgs);
    return cached !== undefined && cached.approved;
  }

  /**
   * Clear all session approvals.
   */
  clearSessionApprovals(): void {
    this._memory.clear();
  }

  /**
   * Request approval for a tool call.
   *
   * Handles the request based on the current mode:
   * - approve_all: Returns approved=true immediately
   * - strict: Returns approved=false with note
   * - interactive: Checks cache, then prompts via callback
   *
   * @param request - The approval request
   * @returns ApprovalDecision with the result
   * @throws Error if interactive mode has no callback
   */
  async requestApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
    // Handle non-interactive modes
    if (this.mode === "approve_all") {
      return { approved: true, remember: "none" };
    }

    if (this.mode === "strict") {
      return {
        approved: false,
        note: `Strict mode: ${request.toolName} requires approval`,
        remember: "none",
      };
    }

    // Interactive mode: check session cache first
    const cached = this._memory.lookup(request.toolName, request.toolArgs);
    if (cached !== undefined) {
      return cached;
    }

    // Prompt user via callback
    if (this._approvalCallback === undefined) {
      throw new Error("No approvalCallback provided for interactive mode");
    }

    const decision = await this._approvalCallback(request);

    // Cache if remember="session" and approved.
    // Denials are intentionally not cached - each denial should be explicit
    // to avoid accidentally blocking legitimate retry attempts.
    if (decision.approved && decision.remember === "session") {
      this._memory.store(request.toolName, request.toolArgs, decision);
    }

    return decision;
  }

  /**
   * Get a callback function that uses this controller.
   *
   * Useful for passing to systems that expect an ApprovalCallback.
   * The returned callback delegates to requestApproval(), which handles
   * all modes (approve_all, strict, interactive) and session caching.
   *
   * @returns An ApprovalCallback that delegates to this controller
   * @throws Error if interactive mode has no callback set (on first call)
   */
  getCallback(): ApprovalCallback {
    return (request: ApprovalRequest): Promise<ApprovalDecision> => {
      return this.requestApproval(request);
    };
  }
}
