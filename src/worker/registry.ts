/**
 * Worker Registry
 *
 * Scans directories for .worker files, caches parsed definitions,
 * and provides lookup by name or alias.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { parseWorkerString } from "./parser.js";
import type { WorkerDefinition, ParseWorkerResult } from "./schema.js";

/**
 * Cached worker entry with metadata.
 */
export interface CachedWorker {
  /** Absolute path to the .worker file */
  filePath: string;
  /** Parsed worker definition */
  definition: WorkerDefinition;
  /** File modification time when cached */
  mtime: number;
}

/**
 * Result of looking up a worker.
 */
export type WorkerLookupResult =
  | { found: true; worker: CachedWorker }
  | { found: false; error: string };

/**
 * Options for creating a WorkerRegistry.
 */
export interface WorkerRegistryOptions {
  /** Search paths for workers (defaults to LLM_DO_PATH env var) */
  searchPaths?: string[];
  /** Whether to watch for file changes (not implemented yet) */
  watch?: boolean;
}

/**
 * Registry for discovering and caching worker definitions.
 */
export class WorkerRegistry {
  private searchPaths: string[];
  private cache: Map<string, CachedWorker> = new Map();
  private nameIndex: Map<string, string> = new Map(); // name → filePath
  private scanned: Set<string> = new Set(); // directories that have been scanned

  constructor(options: WorkerRegistryOptions = {}) {
    this.searchPaths = options.searchPaths ?? this.getDefaultSearchPaths();
  }

  /**
   * Get default search paths from LLM_DO_PATH environment variable.
   */
  private getDefaultSearchPaths(): string[] {
    const envPath = process.env.LLM_DO_PATH;
    if (!envPath) {
      return [];
    }
    // Split on : (Unix) or ; (Windows)
    const separator = process.platform === "win32" ? ";" : ":";
    return envPath
      .split(separator)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }

  /**
   * Add a search path to the registry.
   */
  addSearchPath(dirPath: string): void {
    const absolute = path.resolve(dirPath);
    if (!this.searchPaths.includes(absolute)) {
      this.searchPaths.push(absolute);
    }
  }

  /**
   * Get current search paths.
   */
  getSearchPaths(): string[] {
    return [...this.searchPaths];
  }

  /**
   * Scan all search paths for workers.
   * This populates the cache and name index.
   */
  async scanAll(): Promise<void> {
    for (const searchPath of this.searchPaths) {
      await this.scanDirectory(searchPath);
    }
  }

  /**
   * Scan a directory for .worker files.
   * Recursively scans subdirectories.
   */
  async scanDirectory(dirPath: string): Promise<void> {
    const absolute = path.resolve(dirPath);

    // Skip if already scanned
    if (this.scanned.has(absolute)) {
      return;
    }

    try {
      const stat = await fs.stat(absolute);
      if (!stat.isDirectory()) {
        return;
      }
    } catch {
      // Directory doesn't exist, skip silently
      return;
    }

    this.scanned.add(absolute);

    try {
      const entries = await fs.readdir(absolute, { withFileTypes: true });

      for (const entry of entries) {
        const entryPath = path.join(absolute, entry.name);

        if (entry.isDirectory()) {
          // Skip hidden directories and node_modules
          if (!entry.name.startsWith(".") && entry.name !== "node_modules") {
            await this.scanDirectory(entryPath);
          }
        } else if (entry.isFile() && entry.name.endsWith(".worker")) {
          await this.loadWorker(entryPath);
        }
      }
    } catch (err) {
      // Permission errors or other issues, skip silently
      console.warn(`Failed to scan directory ${absolute}: ${err}`);
    }
  }

  /**
   * Load a worker file into the cache.
   */
  async loadWorker(filePath: string): Promise<ParseWorkerResult> {
    const absolute = path.resolve(filePath);

    try {
      const stat = await fs.stat(absolute);
      const mtime = stat.mtimeMs;

      // Check if cached and still valid
      const cached = this.cache.get(absolute);
      if (cached && cached.mtime === mtime) {
        return { success: true, worker: cached.definition };
      }

      // Read and parse
      const content = await fs.readFile(absolute, "utf-8");
      const result = parseWorkerString(content);

      if (result.success) {
        const cachedWorker: CachedWorker = {
          filePath: absolute,
          definition: result.worker,
          mtime,
        };

        // Update cache
        this.cache.set(absolute, cachedWorker);

        // Update name index
        this.nameIndex.set(result.worker.name, absolute);

        return result;
      }

      return result;
    } catch (err) {
      return {
        success: false,
        error: `Failed to load worker file ${absolute}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Look up a worker by name or file path.
   */
  async get(nameOrPath: string): Promise<WorkerLookupResult> {
    // First, check if it's a direct file path
    if (nameOrPath.endsWith(".worker") || nameOrPath.includes(path.sep) || nameOrPath.includes("/")) {
      const result = await this.loadWorker(nameOrPath);
      if (result.success) {
        const cached = this.cache.get(path.resolve(nameOrPath));
        if (cached) {
          return { found: true, worker: cached };
        }
      }
      return { found: false, error: result.success ? "Worker not found" : result.error };
    }

    // Check name index
    const filePath = this.nameIndex.get(nameOrPath);
    if (filePath) {
      const cached = this.cache.get(filePath);
      if (cached) {
        // Verify still valid
        try {
          const stat = await fs.stat(filePath);
          if (stat.mtimeMs === cached.mtime) {
            return { found: true, worker: cached };
          }
          // File changed, reload
          const result = await this.loadWorker(filePath);
          if (result.success) {
            return { found: true, worker: this.cache.get(filePath)! };
          }
        } catch {
          // File removed, remove from index
          this.nameIndex.delete(nameOrPath);
          this.cache.delete(filePath);
        }
      }
    }

    // Try to find by scanning search paths
    for (const searchPath of this.searchPaths) {
      // Try direct name match
      const directPath = path.join(searchPath, `${nameOrPath}.worker`);
      try {
        await fs.access(directPath);
        const result = await this.loadWorker(directPath);
        if (result.success) {
          return { found: true, worker: this.cache.get(directPath)! };
        }
      } catch {
        // File doesn't exist, continue
      }

      // Try subdirectory with same name
      const subDirPath = path.join(searchPath, nameOrPath, `${nameOrPath}.worker`);
      try {
        await fs.access(subDirPath);
        const result = await this.loadWorker(subDirPath);
        if (result.success) {
          return { found: true, worker: this.cache.get(subDirPath)! };
        }
      } catch {
        // File doesn't exist, continue
      }
    }

    // Scan all paths if not found yet
    await this.scanAll();

    // Try name index again after scanning
    const filePathAfterScan = this.nameIndex.get(nameOrPath);
    if (filePathAfterScan) {
      const cached = this.cache.get(filePathAfterScan);
      if (cached) {
        return { found: true, worker: cached };
      }
    }

    return { found: false, error: `Worker '${nameOrPath}' not found in search paths` };
  }

  /**
   * List all known workers.
   */
  async list(): Promise<CachedWorker[]> {
    await this.scanAll();
    return Array.from(this.cache.values());
  }

  /**
   * List worker names.
   */
  async listNames(): Promise<string[]> {
    await this.scanAll();
    return Array.from(this.nameIndex.keys());
  }

  /**
   * Clear the cache and rescan.
   */
  async refresh(): Promise<void> {
    this.cache.clear();
    this.nameIndex.clear();
    this.scanned.clear();
    await this.scanAll();
  }

  /**
   * Clear only the scanned directories set to allow rescanning.
   */
  clearScanned(): void {
    this.scanned.clear();
  }

  /**
   * Get cache statistics.
   */
  getStats(): { cachedCount: number; searchPaths: number; scannedDirs: number } {
    return {
      cachedCount: this.cache.size,
      searchPaths: this.searchPaths.length,
      scannedDirs: this.scanned.size,
    };
  }
}

/**
 * Create a worker registry with default settings.
 */
export function createWorkerRegistry(options?: WorkerRegistryOptions): WorkerRegistry {
  return new WorkerRegistry(options);
}
