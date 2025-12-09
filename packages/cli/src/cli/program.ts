/**
 * Program Detection
 *
 * Find program root and load configuration.
 * Supports both legacy JSON format and new YAML format.
 */

import * as fs from "fs/promises";
import * as path from "path";
import {
  findProgramConfig as findYamlProgramConfig,
  type ProgramConfig as YamlProgramConfig,
  resolveSandboxConfig,
  mergeWithCLIOptions,
} from "../config/index.js";

/**
 * Program configuration - supports both legacy JSON and new YAML format.
 */
export interface ProgramConfig {
  /** Default model to use */
  model?: string;
  /** Default trust level (legacy) */
  trustLevel?: "untrusted" | "session" | "workspace" | "full";
  /** Worker search paths relative to program root */
  workerPaths?: string[];
  /** Default approval mode */
  approvalMode?: "interactive" | "approve_all" | "auto_deny";
  /** Sandbox configuration (from YAML config) */
  sandbox?: YamlProgramConfig["sandbox"];
  /** Delegation configuration (from YAML config) */
  delegation?: YamlProgramConfig["delegation"];
}

/**
 * Detected program information.
 */
export interface ProgramInfo {
  /** Absolute path to program root */
  root: string;
  /** How the program was detected */
  detectedBy: string;
  /** Program configuration (if found) */
  config?: ProgramConfig;
}

/**
 * Markers that indicate a program root, in order of priority.
 * YAML config files are checked first (new format), then JSON (legacy).
 */
const PROGRAM_MARKERS = [
  { file: "golem-forge.config.yaml", type: "yaml-config" },
  { file: "golem-forge.config.yml", type: "yaml-config" },
  { file: ".golem-forge.json", type: "json-config" },
  { file: ".llm-do", type: "marker" },
  { file: "golem-forge.config.json", type: "json-config" },
  { file: "package.json", type: "npm" },
  { file: ".git", type: "git" },
];

/**
 * Find the program root by walking up from the given directory.
 *
 * @param startDir - Directory to start searching from (default: cwd)
 * @returns Program info if found, null otherwise
 */
export async function findProgramRoot(startDir?: string): Promise<ProgramInfo | null> {
  let currentDir = path.resolve(startDir || process.cwd());
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    for (const marker of PROGRAM_MARKERS) {
      const markerPath = path.join(currentDir, marker.file);

      try {
        await fs.access(markerPath);

        // Found a marker
        const info: ProgramInfo = {
          root: currentDir,
          detectedBy: marker.file,
        };

        // Load config based on type
        if (marker.type === "yaml-config") {
          try {
            const yamlResult = await findYamlProgramConfig(currentDir);
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
            info.config = JSON.parse(content) as ProgramConfig;
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
 * Load program configuration from a specific file.
 */
export async function loadProgramConfig(configPath: string): Promise<ProgramConfig | null> {
  try {
    const content = await fs.readFile(configPath, "utf-8");
    return JSON.parse(content) as ProgramConfig;
  } catch {
    return null;
  }
}

/**
 * Filter out undefined values from an object to avoid overwriting with undefined during spread.
 */
function filterUndefined<T extends object>(obj: T | undefined): Partial<T> {
  if (!obj) return {};
  const result: Partial<T> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}

/**
 * Get effective configuration by merging program config with defaults.
 *
 * Priority order for model:
 *   1. CLI --model flag (in overrides)
 *   2. Program config model
 *   3. GOLEM_FORGE_MODEL environment variable
 */
export function getEffectiveConfig(
  programConfig?: ProgramConfig,
  overrides?: Partial<ProgramConfig>
): ProgramConfig {
  // Environment variable serves as fallback default for model
  const envModel = process.env.GOLEM_FORGE_MODEL;

  const defaults: ProgramConfig = {
    model: envModel,
    trustLevel: "session",
    approvalMode: "interactive",
    workerPaths: ["workers", ".workers"],
  };

  // Filter out undefined values to avoid overwriting defaults with undefined
  const filteredProgramConfig = filterUndefined(programConfig);
  const filteredOverrides = filterUndefined(overrides);

  return {
    ...defaults,
    ...filteredProgramConfig,
    ...filteredOverrides,
  };
}

/**
 * Resolve worker paths relative to program root.
 */
export function resolveWorkerPaths(programRoot: string, workerPaths: string[]): string[] {
  return workerPaths.map((p) => path.resolve(programRoot, p));
}

// Re-export the sandbox config resolver for use by CLI
export { resolveSandboxConfig, mergeWithCLIOptions };
