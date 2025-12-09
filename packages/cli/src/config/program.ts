/**
 * Program Configuration
 *
 * Schema and loader for golem-forge.config.yaml program configuration files.
 * This defines the program-level sandbox and other settings.
 */

import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "js-yaml";

/**
 * Schema for sandbox configuration in program config.
 * Uses mount-based model (Docker-style).
 */
export const SandboxProgramConfigSchema = z.object({
  /** Root directory to mount at / (relative to program root) */
  root: z.string().default("."),
  /** Read-only mode */
  readonly: z.boolean().optional(),
}).strict();

export type SandboxProgramConfig = z.infer<typeof SandboxProgramConfigSchema>;

/**
 * Schema for approval configuration.
 */
export const ApprovalProgramConfigSchema = z.object({
  /** Default approval mode */
  mode: z.enum(["interactive", "approve_all", "auto_deny"]).optional(),
}).strict();

export type ApprovalProgramConfig = z.infer<typeof ApprovalProgramConfigSchema>;

/**
 * Schema for delegation configuration.
 */
export const DelegationProgramConfigSchema = z.object({
  /** Maximum delegation depth */
  maxDepth: z.number().positive().default(5),
}).strict();

export type DelegationProgramConfig = z.infer<typeof DelegationProgramConfigSchema>;

/**
 * Complete program configuration schema.
 */
export const ProgramConfigSchema = z.object({
  /** Default model to use */
  model: z.string().optional(),
  /** Sandbox configuration */
  sandbox: SandboxProgramConfigSchema.optional(),
  /** Approval configuration */
  approval: ApprovalProgramConfigSchema.optional(),
  /** Delegation configuration */
  delegation: DelegationProgramConfigSchema.optional(),
  /** Worker search paths relative to program root */
  workerPaths: z.array(z.string()).optional(),
}).strict();

export type ProgramConfig = z.infer<typeof ProgramConfigSchema>;

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
 * Program configuration file names to look for.
 */
const CONFIG_FILE_NAMES = [
  "golem-forge.config.yaml",
  "golem-forge.config.yml",
];

/**
 * Load program configuration from a YAML file.
 *
 * @param configPath - Path to the config file
 * @returns Parsed and validated program config
 * @throws Error if file can't be read or parsed
 */
export async function loadProgramConfigFile(configPath: string): Promise<ProgramConfig> {
  const content = await fs.readFile(configPath, "utf-8");
  const parsed = yaml.load(content);

  const result = ProgramConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `  - ${issue.path.join(".")}: ${issue.message}`
    ).join("\n");
    throw new Error(`Invalid program config in ${configPath}:\n${issues}`);
  }

  return result.data;
}

/**
 * Find and load program configuration.
 *
 * Searches for golem-forge.config.yaml in the given directory
 * and parent directories.
 *
 * @param startDir - Directory to start searching from
 * @returns Config and path if found, null otherwise
 */
export async function findProgramConfig(
  startDir: string
): Promise<{ config: ProgramConfig; configPath: string; programRoot: string } | null> {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    for (const fileName of CONFIG_FILE_NAMES) {
      const configPath = path.join(currentDir, fileName);

      try {
        await fs.access(configPath);
        const config = await loadProgramConfigFile(configPath);
        return {
          config,
          configPath,
          programRoot: currentDir,
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
 * @param programRoot - Absolute path to program root
 * @param sandboxConfig - Sandbox configuration from program config
 * @returns Resolved sandbox config with absolute path
 */
export function resolveSandboxConfig(
  programRoot: string,
  sandboxConfig?: SandboxProgramConfig
): ResolvedSandboxConfig {
  // Default: mount program root at /
  const config = sandboxConfig ?? { root: "." };
  const sandboxRoot = path.resolve(programRoot, config.root);

  return {
    root: sandboxRoot,
    readonly: config.readonly,
  };
}

/**
 * Get default program configuration.
 */
export function getDefaultProgramConfig(): ProgramConfig {
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
 * Merge CLI options with program config.
 *
 * CLI options take precedence over program config.
 */
export function mergeWithCLIOptions(
  programConfig: ProgramConfig | undefined,
  cliOptions: {
    model?: string;
    approvalMode?: string;
  }
): ProgramConfig {
  const defaults = getDefaultProgramConfig();
  const config = programConfig ?? {};

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
