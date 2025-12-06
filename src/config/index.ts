/**
 * Config Module
 *
 * Project configuration schema and loading.
 */

export {
  ProjectConfigSchema,
  SandboxProjectConfigSchema,
  ZoneDefinitionSchema,
  ApprovalProjectConfigSchema,
  DelegationProjectConfigSchema,
  type ProjectConfig,
  type SandboxProjectConfig,
  type ZoneDefinition,
  type ZoneMode,
  type ApprovalProjectConfig,
  type DelegationProjectConfig,
  type ResolvedZone,
  type ResolvedSandboxConfig,
  loadProjectConfigFile,
  findProjectConfig,
  resolveSandboxConfig,
  getDefaultProjectConfig,
  mergeWithCLIOptions,
} from "./project.js";
