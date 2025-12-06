/**
 * Project Configuration
 *
 * Schema and loader for golem-forge.config.yaml project configuration files.
 * This defines the project-level sandbox zones and other settings.
 */

import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import * as yaml from "js-yaml";

/**
 * Zone mode - read-only or read-write.
 */
export type ZoneMode = "ro" | "rw";

/**
 * Schema for a sandbox zone definition.
 */
export const ZoneDefinitionSchema = z.object({
  /** Relative path from sandbox root */
  path: z.string(),
  /** Access mode: ro (read-only) or rw (read-write) */
  mode: z.enum(["ro", "rw"]).default("rw"),
});

export type ZoneDefinition = z.infer<typeof ZoneDefinitionSchema>;

/**
 * Schema for sandbox configuration in project config.
 */
export const SandboxProjectConfigSchema = z.object({
  /** Mode: sandboxed (all in sandbox/) or direct (custom paths) */
  mode: z.enum(["sandboxed", "direct"]).default("sandboxed"),
  /** Root directory for sandboxed mode */
  root: z.string().default("sandbox"),
  /** Zone definitions */
  zones: z.record(z.string(), ZoneDefinitionSchema).default({}),
});

export type SandboxProjectConfig = z.infer<typeof SandboxProjectConfigSchema>;

/**
 * Schema for approval configuration.
 */
export const ApprovalProjectConfigSchema = z.object({
  /** Default approval mode */
  mode: z.enum(["interactive", "approve_all", "auto_deny"]).optional(),
});

export type ApprovalProjectConfig = z.infer<typeof ApprovalProjectConfigSchema>;

/**
 * Schema for delegation configuration.
 */
export const DelegationProjectConfigSchema = z.object({
  /** Maximum delegation depth */
  maxDepth: z.number().positive().default(5),
});

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
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

/**
 * Resolved zone with absolute path.
 */
export interface ResolvedZone {
  /** Zone name */
  name: string;
  /** Absolute path to the zone directory */
  absolutePath: string;
  /** Relative path from project root */
  relativePath: string;
  /** Access mode */
  mode: ZoneMode;
}

/**
 * Resolved sandbox configuration with absolute paths.
 */
export interface ResolvedSandboxConfig {
  /** Sandbox mode */
  mode: "sandboxed" | "direct";
  /** Absolute path to sandbox root */
  root: string;
  /** Resolved zones with absolute paths */
  zones: Map<string, ResolvedZone>;
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
 * Resolve sandbox configuration to absolute paths.
 *
 * Converts relative zone paths to absolute paths based on project root.
 *
 * @param projectRoot - Absolute path to project root
 * @param sandboxConfig - Sandbox configuration from project config
 * @returns Resolved sandbox config with absolute paths
 */
export function resolveSandboxConfig(
  projectRoot: string,
  sandboxConfig?: SandboxProjectConfig
): ResolvedSandboxConfig {
  // Default config if none provided
  const config = sandboxConfig ?? {
    mode: "sandboxed" as const,
    root: ".sandbox",
    zones: {
      cache: { path: "./cache", mode: "rw" as const },
      workspace: { path: "./workspace", mode: "rw" as const },
    },
  };

  const sandboxRoot = path.resolve(projectRoot, config.root);

  // Resolve zones
  const zones = new Map<string, ResolvedZone>();

  // If no zones defined, use defaults
  const zoneDefs = Object.keys(config.zones).length > 0
    ? config.zones
    : {
        cache: { path: "./cache", mode: "rw" as const },
        workspace: { path: "./workspace", mode: "rw" as const },
      };

  for (const [name, zoneDef] of Object.entries(zoneDefs)) {
    // In sandboxed mode, zone paths are relative to sandbox root
    // In direct mode, zone paths are relative to project root
    const basePath = config.mode === "sandboxed" ? sandboxRoot : projectRoot;
    const absolutePath = path.resolve(basePath, zoneDef.path);

    zones.set(name, {
      name,
      absolutePath,
      relativePath: zoneDef.path,
      mode: zoneDef.mode,
    });
  }

  return {
    mode: config.mode,
    root: sandboxRoot,
    zones,
  };
}

/**
 * Get default project configuration.
 */
export function getDefaultProjectConfig(): ProjectConfig {
  return {
    sandbox: {
      mode: "sandboxed",
      root: ".sandbox",
      zones: {
        cache: { path: "./cache", mode: "rw" },
        workspace: { path: "./workspace", mode: "rw" },
      },
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
