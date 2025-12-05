/**
 * Project Detection
 *
 * Find project root and load configuration.
 */

import * as fs from "fs/promises";
import * as path from "path";

/**
 * Project configuration from .golem-forge.json or similar.
 */
export interface ProjectConfig {
  /** Default model to use */
  model?: string;
  /** Default trust level */
  trustLevel?: "untrusted" | "session" | "workspace" | "full";
  /** Worker search paths relative to project root */
  workerPaths?: string[];
  /** Default approval mode */
  approvalMode?: "interactive" | "approve_all" | "strict";
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
 */
const PROJECT_MARKERS = [
  { file: ".golem-forge.json", type: "config" },
  { file: ".llm-do", type: "marker" },
  { file: "golem-forge.config.json", type: "config" },
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

        // Load config if it's a config file
        if (marker.type === "config") {
          try {
            const content = await fs.readFile(markerPath, "utf-8");
            info.config = JSON.parse(content) as ProjectConfig;
          } catch (err) {
            // Config file exists but couldn't be parsed, warn and continue with defaults
            console.warn(
              `Warning: Failed to parse config file ${markerPath}: ${err instanceof Error ? err.message : String(err)}`
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
