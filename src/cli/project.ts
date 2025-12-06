/**
 * Project Detection
 *
 * Find project root and load configuration.
 * Supports both legacy JSON format and new YAML format.
 */

import * as fs from "fs/promises";
import * as path from "path";
import {
  findProjectConfig as findYamlProjectConfig,
  type ProjectConfig as YamlProjectConfig,
  resolveSandboxConfig,
  mergeWithCLIOptions,
} from "../config/index.js";

/**
 * Project configuration - supports both legacy JSON and new YAML format.
 */
export interface ProjectConfig {
  /** Default model to use */
  model?: string;
  /** Default trust level (legacy) */
  trustLevel?: "untrusted" | "session" | "workspace" | "full";
  /** Worker search paths relative to project root */
  workerPaths?: string[];
  /** Default approval mode */
  approvalMode?: "interactive" | "approve_all" | "auto_deny";
  /** Sandbox configuration (from YAML config) */
  sandbox?: YamlProjectConfig["sandbox"];
  /** Delegation configuration (from YAML config) */
  delegation?: YamlProjectConfig["delegation"];
}

/**
 * Detected project information.
 */
export interface ProjectInfo {
  /** Absolute path to project root */
  root: string;
  /** How the project was detected */
  detectedBy: string;
  /** Project configuration (if found) */
  config?: ProjectConfig;
}

/**
 * Markers that indicate a project root, in order of priority.
 * YAML config files are checked first (new format), then JSON (legacy).
 */
const PROJECT_MARKERS = [
  { file: "golem-forge.config.yaml", type: "yaml-config" },
  { file: "golem-forge.config.yml", type: "yaml-config" },
  { file: ".golem-forge.json", type: "json-config" },
  { file: ".llm-do", type: "marker" },
  { file: "golem-forge.config.json", type: "json-config" },
  { file: "package.json", type: "npm" },
  { file: ".git", type: "git" },
];

/**
 * Find the project root by walking up from the given directory.
 *
 * @param startDir - Directory to start searching from (default: cwd)
 * @returns Project info if found, null otherwise
 */
export async function findProjectRoot(startDir?: string): Promise<ProjectInfo | null> {
  let currentDir = path.resolve(startDir || process.cwd());
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    for (const marker of PROJECT_MARKERS) {
      const markerPath = path.join(currentDir, marker.file);

      try {
        await fs.access(markerPath);

        // Found a marker
        const info: ProjectInfo = {
          root: currentDir,
          detectedBy: marker.file,
        };

        // Load config based on type
        if (marker.type === "yaml-config") {
          try {
            const yamlResult = await findYamlProjectConfig(currentDir);
            if (yamlResult) {
              info.config = {
                model: yamlResult.config.model,
                approvalMode: yamlResult.config.approval?.mode,
                workerPaths: yamlResult.config.workerPaths,
                sandbox: yamlResult.config.sandbox,
                delegation: yamlResult.config.delegation,
              };
            }
          } catch (err) {
            console.warn(
              `Warning: Failed to parse YAML config file ${markerPath}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        } else if (marker.type === "json-config") {
          try {
            const content = await fs.readFile(markerPath, "utf-8");
            info.config = JSON.parse(content) as ProjectConfig;
          } catch (err) {
            console.warn(
              `Warning: Failed to parse JSON config file ${markerPath}: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }

        return info;
      } catch {
        // Marker not found, continue
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
 * Load project configuration from a specific file.
 */
export async function loadProjectConfig(configPath: string): Promise<ProjectConfig | null> {
  try {
    const content = await fs.readFile(configPath, "utf-8");
    return JSON.parse(content) as ProjectConfig;
  } catch {
    return null;
  }
}

/**
 * Get effective configuration by merging project config with defaults.
 */
export function getEffectiveConfig(
  projectConfig?: ProjectConfig,
  overrides?: Partial<ProjectConfig>
): ProjectConfig {
  const defaults: ProjectConfig = {
    trustLevel: "session",
    approvalMode: "interactive",
    workerPaths: ["workers", ".workers"],
  };

  return {
    ...defaults,
    ...projectConfig,
    ...overrides,
  };
}

/**
 * Resolve worker paths relative to project root.
 */
export function resolveWorkerPaths(projectRoot: string, workerPaths: string[]): string[] {
  return workerPaths.map((p) => path.resolve(projectRoot, p));
}

// Re-export the sandbox config resolver for use by CLI
export { resolveSandboxConfig, mergeWithCLIOptions };
