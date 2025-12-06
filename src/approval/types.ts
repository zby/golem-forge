/**
 * Core approval types.
 *
 * This module defines the fundamental data types for the blocking approval system.
 * Uses AI SDK v6 patterns where possible:
 * - needsApproval: boolean (matches SDK tool property)
 * - ToolApprovalResponse pattern for decisions
 *
 * "Blocked" operations (e.g., sandbox permission denied) are handled separately
 * by throwing BlockedError, not through the approval flow.
 */

// Note: AI SDK v6 exports ToolApprovalRequest and ToolApprovalResponse for message protocol.
// We use a simpler approach: needsApproval returns boolean, BlockedError for forbidden ops.

/**
 * Error thrown when an operation is blocked by policy.
 * This is separate from the approval flow - blocked operations
 * should not even be presented to the user for approval.
 */
export class BlockedError extends Error {
  constructor(
    public readonly toolName: string,
    public readonly reason: string
  ) {
    super(`Tool '${toolName}' blocked: ${reason}`);
    this.name = "BlockedError";
  }
}

/**
 * Request for user approval before executing a tool.
 *
 * Created when a tool call needs approval.
 * Passed to the approval callback for user decision.
 */
/**
 * Security context for approval requests.
 */
export interface SecurityContext {
  /** Trust level for this operation */
  trustLevel?: "untrusted" | "session" | "workspace" | "full";
}

export interface ApprovalRequest {
  /** Name of the tool requesting approval */
  toolName: string;
  /** Arguments passed to the tool (used for display and session cache matching) */
  toolArgs: Record<string, unknown>;
  /** Human-readable description of what the tool wants to do */
  description: string;
  /** Optional security context for display purposes */
  securityContext?: SecurityContext;
  /** Worker delegation chain for context (e.g., ["parent", "child"]) */
  delegationPath?: string[];
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
 * over which tool calls need user approval.
 *
 * Note: For blocked operations (e.g., sandbox permission denied),
 * throw BlockedError instead of returning from needsApproval().
 */
export interface SupportsNeedsApproval<TContext = unknown> {
  /**
   * Determine if a tool call needs approval.
   *
   * @param name - Tool name being called
   * @param toolArgs - Arguments passed to the tool
   * @param ctx - Execution context
   * @returns true if approval is needed, false if pre-approved
   * @throws BlockedError if the operation is forbidden by policy
   */
  needsApproval(
    name: string,
    toolArgs: Record<string, unknown>,
    ctx: TContext
  ): boolean;
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
