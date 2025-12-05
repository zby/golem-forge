/**
 * Approval Integration with Lemmy
 *
 * Provides the glue between lemmy's tool system and the approval system.
 */

export {
  ApprovedExecutor,
  createApprovedExecutor,
  type ApprovedExecutorOptions,
  type ApprovedExecuteResult,
} from "./approved-executor.js";
