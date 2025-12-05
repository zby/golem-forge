/**
 * Approval System Core
 *
 * Runtime-agnostic approval system for LLM tool execution.
 * This package provides the core types and logic for approval handling,
 * without any dependency on specific runtimes (CLI, browser, VS Code).
 */

// Types
export {
  ApprovalResult,
  type ApprovalStatus,
  type ApprovalRequest,
  type ApprovalDecision,
  type RememberOption,
  type ApprovalCallback,
  type SecurityContext,
  type SupportsNeedsApproval,
  type SupportsApprovalDescription,
  supportsNeedsApproval,
  supportsApprovalDescription,
} from "./types.js";

// Memory
export { ApprovalMemory } from "./memory.js";

// Controller
export {
  ApprovalController,
  type ApprovalMode,
  type ApprovalControllerOptions,
} from "./controller.js";
