/**
 * Project Configuration
 *
 * Schema and loader for golem-forge.config.yaml project configuration files.
 * This defines the project-level sandbox and other settings.
 */

import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "js-yaml";

/**
 * Schema for sandbox configuration in project config.
 * Uses mount-based model (Docker-style).
 */
export const SandboxProjectConfigSchema = z.object({
  /** Root directory to mount at / (relative to project root) */
  root: z.string().default("."),
  /** Read-only mode */
  readonly: z.boolean().optional(),
}).strict();

export type SandboxProjectConfig = z.infer<typeof SandboxProjectConfigSchema>;

/**
 * Schema for approval configuration.
 */
export const ApprovalProjectConfigSchema = z.object({
  /** Default approval mode */
  mode: z.enum(["interactive", "approve_all", "auto_deny"]).optional(),
}).strict();

export type ApprovalProjectConfig = z.infer<typeof ApprovalProjectConfigSchema>;

/**
 * Schema for delegation configuration.
 */
export const DelegationProjectConfigSchema = z.object({
  /** Maximum delegation depth */
  maxDepth: z.number().positive().default(5),
}).strict();

export type DelegationProjectConfig = z.infer<typeof DelegationProjectConfigSchema>;

/**
 * Complete project configuration schema.
 */
export const ProjectConfigSchema = z.object({
  /** Default model to use */
  model: z.string().optional(),
  /** Sandbox configuration */
  sandbox: SandboxProjectConfigSchema.optional(),
  /** Approval configuration */
  approval: ApprovalProjectConfigSchema.optional(),
  /** Delegation configuration */
  delegation: DelegationProjectConfigSchema.optional(),
  /** Worker search paths relative to project root */
  workerPaths: z.array(z.string()).optional(),
}).strict();

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

/**
 * Resolved sandbox configuration with absolute path.
 */
export interface ResolvedSandboxConfig {
  /** Absolute path to sandbox root */
  root: string;
  /** Read-only mode */
  readonly?: boolean;
}

/**
 * Project configuration file names to look for.
 */
const CONFIG_FILE_NAMES = [
  "golem-forge.config.yaml",
  "golem-forge.config.yml",
];

/**
 * Load project configuration from a YAML file.
 *
 * @param configPath - Path to the config file
 * @returns Parsed and validated project config
 * @throws Error if file can't be read or parsed
 */
export async function loadProjectConfigFile(configPath: string): Promise<ProjectConfig> {
  const content = await fs.readFile(configPath, "utf-8");
  const parsed = yaml.load(content);

  const result = ProjectConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `  - ${issue.path.join(".")}: ${issue.message}`
    ).join("\n");
    throw new Error(`Invalid project config in ${configPath}:\n${issues}`);
  }

  return result.data;
}

/**
 * Find and load project configuration.
 *
 * Searches for golem-forge.config.yaml in the given directory
 * and parent directories.
 *
 * @param startDir - Directory to start searching from
 * @returns Config and path if found, null otherwise
 */
export async function findProjectConfig(
  startDir: string
): Promise<{ config: ProjectConfig; configPath: string; projectRoot: string } | null> {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    for (const fileName of CONFIG_FILE_NAMES) {
      const configPath = path.join(currentDir, fileName);

      try {
        await fs.access(configPath);
        const config = await loadProjectConfigFile(configPath);
        return {
          config,
          configPath,
          projectRoot: currentDir,
        };
      } catch {
        // Config file not found, continue searching
      }
    }

    // Move up one directory
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break; // Reached root
    }
    currentDir = parentDir;
  }

  return null;
}

/**
 * Resolve sandbox configuration to absolute path.
 *
 * @param projectRoot - Absolute path to project root
 * @param sandboxConfig - Sandbox configuration from project config
 * @returns Resolved sandbox config with absolute path
 */
export function resolveSandboxConfig(
  projectRoot: string,
  sandboxConfig?: SandboxProjectConfig
): ResolvedSandboxConfig {
  // Default: mount project root at /
  const config = sandboxConfig ?? { root: "." };
  const sandboxRoot = path.resolve(projectRoot, config.root);

  return {
    root: sandboxRoot,
    readonly: config.readonly,
  };
}

/**
 * Get default project configuration.
 */
export function getDefaultProjectConfig(): ProjectConfig {
  return {
    sandbox: {
      root: ".",
    },
    approval: {
      mode: "interactive",
    },
    delegation: {
      maxDepth: 5,
    },
    workerPaths: ["workers", ".workers"],
  };
}

/**
 * Merge CLI options with project config.
 *
 * CLI options take precedence over project config.
 */
export function mergeWithCLIOptions(
  projectConfig: ProjectConfig | undefined,
  cliOptions: {
    model?: string;
    approvalMode?: string;
  }
): ProjectConfig {
  const defaults = getDefaultProjectConfig();
  const config = projectConfig ?? {};

  return {
    ...defaults,
    ...config,
    model: cliOptions.model ?? config.model ?? defaults.model,
    approval: {
      ...defaults.approval,
      ...config.approval,
      mode: (cliOptions.approvalMode ?? config.approval?.mode ?? defaults.approval?.mode) as
        | "interactive"
        | "approve_all"
        | "auto_deny"
        | undefined,
    },
  };
}
