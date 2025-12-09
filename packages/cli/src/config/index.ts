/**
 * Config Module
 *
 * Program configuration schema and loading.
 */

export {
  ProgramConfigSchema,
  SandboxProgramConfigSchema,
  ApprovalProgramConfigSchema,
  DelegationProgramConfigSchema,
  type ProgramConfig,
  type SandboxProgramConfig,
  type ApprovalProgramConfig,
  type DelegationProgramConfig,
  type ResolvedSandboxConfig,
  loadProgramConfigFile,
  findProgramConfig,
  resolveSandboxConfig,
  getDefaultProgramConfig,
  mergeWithCLIOptions,
} from "./program.js";
