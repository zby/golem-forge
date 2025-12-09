/**
 * Approval System (Re-exported from Core)
 *
 * All approval functionality is now in @golem-forge/core.
 * This file re-exports for backwards compatibility with existing CLI imports.
 */

export {
  BlockedError,
  ApprovalMemory,
  ApprovalController,
  type ApprovalRequest,
  type ApprovalDecision,
  type RememberOption,
  type ApprovalCallback,
  type SecurityContext,
  type ToolApprovalConfig,
  type ApprovalConfig,
  type ApprovalMode,
  type ApprovalControllerOptions,
} from "@golem-forge/core";
