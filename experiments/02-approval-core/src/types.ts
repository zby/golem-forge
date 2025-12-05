/**
 * Core approval types.
 *
 * This module defines the fundamental data types for the blocking approval system:
 * - ApprovalResult: Structured result from approval checking
 * - ApprovalRequest: Returned by tools to request approval
 * - ApprovalDecision: User's decision about a tool call
 * - SupportsNeedsApproval: Interface for toolsets with custom approval logic
 * - SupportsApprovalDescription: Interface for custom approval descriptions
 */

/**
 * Status of an approval check.
 */
export type ApprovalStatus = "blocked" | "pre_approved" | "needs_approval";

/**
 * Result of checking if a tool call needs approval.
 *
 * Use factory methods to create instances:
 * - ApprovalResult.blocked(reason) - Operation forbidden by policy
 * - ApprovalResult.preApproved() - No user prompt needed
 * - ApprovalResult.needsApproval() - Requires user approval
 */
export class ApprovalResult {
  readonly status: ApprovalStatus;
  readonly blockReason?: string;

  private constructor(status: ApprovalStatus, blockReason?: string) {
    this.status = status;
    this.blockReason = blockReason;
  }

  /**
   * Operation is forbidden by policy.
   */
  static blocked(reason: string): ApprovalResult {
    return new ApprovalResult("blocked", reason);
  }

  /**
   * Operation is pre-approved, no user prompt needed.
   */
  static preApproved(): ApprovalResult {
    return new ApprovalResult("pre_approved");
  }

  /**
   * Operation requires user approval.
   */
  static needsApproval(): ApprovalResult {
    return new ApprovalResult("needs_approval");
  }

  get isBlocked(): boolean {
    return this.status === "blocked";
  }

  get isPreApproved(): boolean {
    return this.status === "pre_approved";
  }

  get isNeedsApproval(): boolean {
    return this.status === "needs_approval";
  }
}

/**
 * Request for user approval before executing a tool.
 *
 * Created when a tool call needs approval.
 * Passed to the approval callback for user decision.
 */
export interface ApprovalRequest {
  /** Name of the tool requesting approval */
  toolName: string;
  /** Arguments passed to the tool (used for display and session cache matching) */
  toolArgs: Record<string, unknown>;
  /** Human-readable description of what the tool wants to do */
  description: string;
}

/**
 * How long to remember an approval decision.
 */
export type RememberOption = "none" | "session";

/**
 * User's decision about a tool call.
 *
 * Returned after the user (or auto-mode) decides whether to approve
 * a tool operation.
 */
export interface ApprovalDecision {
  /** Whether the operation should proceed */
  approved: boolean;
  /** Optional reason for rejection or comment */
  note?: string;
  /** Whether to cache this decision for the session */
  remember: RememberOption;
}

/**
 * THE KEY ABSTRACTION: Runtime callback for approval.
 *
 * This is what makes the system runtime-agnostic. Different runtimes
 * (CLI, browser extension, VS Code) provide different implementations.
 */
export type ApprovalCallback = (request: ApprovalRequest) => Promise<ApprovalDecision>;

/**
 * Interface for toolsets with custom approval logic.
 *
 * Toolsets implementing this interface provide fine-grained control
 * over which tool calls are blocked, pre-approved, or need user approval.
 */
export interface SupportsNeedsApproval<TContext = unknown> {
  /**
   * Determine approval status for a tool call.
   *
   * @param name - Tool name being called
   * @param toolArgs - Arguments passed to the tool
   * @param ctx - Execution context
   * @returns ApprovalResult with status: blocked, pre_approved, or needs_approval
   */
  needsApproval(
    name: string,
    toolArgs: Record<string, unknown>,
    ctx: TContext
  ): ApprovalResult;
}

/**
 * Interface for toolsets that provide custom approval descriptions.
 *
 * Optional interface. If not implemented, a default description
 * is generated from tool name and arguments.
 */
export interface SupportsApprovalDescription<TContext = unknown> {
  /**
   * Return human-readable description for approval prompt.
   *
   * Only called when needsApproval() returns needs_approval status.
   *
   * @param name - Tool name being called
   * @param toolArgs - Arguments passed to the tool
   * @param ctx - Execution context
   * @returns Description string to show user (e.g., "Execute: git status")
   */
  getApprovalDescription(
    name: string,
    toolArgs: Record<string, unknown>,
    ctx: TContext
  ): string;
}

/**
 * Type guard to check if an object implements SupportsNeedsApproval.
 */
export function supportsNeedsApproval<T>(
  obj: unknown
): obj is SupportsNeedsApproval<T> {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "needsApproval" in obj &&
    typeof (obj as SupportsNeedsApproval<T>).needsApproval === "function"
  );
}

/**
 * Type guard to check if an object implements SupportsApprovalDescription.
 */
export function supportsApprovalDescription<T>(
  obj: unknown
): obj is SupportsApprovalDescription<T> {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "getApprovalDescription" in obj &&
    typeof (obj as SupportsApprovalDescription<T>).getApprovalDescription === "function"
  );
}
