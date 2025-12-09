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
 * Security context for approval requests.
 */
export interface SecurityContext {
  /** Trust level for this operation */
  trustLevel?: "untrusted" | "session" | "workspace" | "full";
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
 * Per-tool approval configuration.
 *
 * Allows declarative configuration of approval behavior without
 * implementing the full SupportsNeedsApproval interface.
 */
export interface ToolApprovalConfig {
  /** If true, tool is pre-approved (no user prompt needed) */
  preApproved?: boolean;
  /** If true, tool is blocked entirely (throws BlockedError) */
  blocked?: boolean;
  /** Reason for blocking (used in error message) */
  blockReason?: string;
}

/**
 * Approval configuration for a set of tools.
 *
 * Keys are tool names, values are per-tool config.
 * Tools not listed use the default behavior (needs approval).
 *
 * @example
 * ```typescript
 * const config: ApprovalConfig = {
 *   read_file: { preApproved: true },
 *   list_files: { preApproved: true },
 *   write_file: { preApproved: false },  // explicit: needs approval
 *   dangerous_tool: { blocked: true, blockReason: "Disabled by policy" },
 * };
 * ```
 */
export interface ApprovalConfig {
  [toolName: string]: ToolApprovalConfig;
}
