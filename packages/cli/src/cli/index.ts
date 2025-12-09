/**
 * CLI Application
 */

export {
  createCLIApprovalCallback,
  createAutoApproveCallback,
  createAutoDenyCallback,
  type CLIApprovalOptions,
} from "./approval.js";

export {
  findProgramRoot,
  loadProgramConfig,
  getEffectiveConfig,
  resolveWorkerPaths,
  type ProgramConfig,
  type ProgramInfo,
} from "./program.js";

export { runCLI } from "./run.js";
