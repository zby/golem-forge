/**
 * Config Module
 *
 * Project configuration schema and loading.
 */

export {
  ProjectConfigSchema,
  SandboxProjectConfigSchema,
  ApprovalProjectConfigSchema,
  DelegationProjectConfigSchema,
  type ProjectConfig,
  type SandboxProjectConfig,
  type ApprovalProjectConfig,
  type DelegationProjectConfig,
  type ResolvedSandboxConfig,
  loadProjectConfigFile,
  findProjectConfig,
  resolveSandboxConfig,
  getDefaultProjectConfig,
  mergeWithCLIOptions,
} from "./project.js";
