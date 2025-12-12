/**
 * Worker Manager
 *
 * Manages worker definitions in the browser extension.
 * Unlike CLI's WorkerRegistry (filesystem-based), this uses:
 * - Bundled workers (included in extension)
 * - GitHub-fetched workers (cached in OPFS)
 *
 * The output is the same WorkerDefinition type, but discovery is different.
 *
 * Note: Worker parsing uses the shared `parseWorkerString` from @golem-forge/core
 * to avoid code duplication. The core parser uses the `yaml` package which is
 * browser-compatible.
 */

import {
  parseWorkerString,
  type WorkerDefinition,
  type ParseResult,
  type ParseError,
  type ParseWorkerResult,
} from '@golem-forge/core';
import type { WorkerSource, GitHubWorkerSource } from '../storage/types';
import { programManager } from '../storage/program-manager';
import { settingsManager } from '../storage/settings-manager';

// Re-export parseWorkerString and types for convenience
export { parseWorkerString };
export type { WorkerDefinition, ParseResult, ParseError, ParseWorkerResult };

// ─────────────────────────────────────────────────────────────────────────────
// Worker Info Type
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Information about an available worker.
 */
export interface WorkerInfo {
  /** Worker name (from definition) */
  name: string;
  /** Worker description */
  description?: string;
  /** Source this worker comes from */
  sourceId: string;
  /** Source type */
  sourceType: 'bundled' | 'github';
  /** Worker file path/identifier within the source */
  path: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bundled Programs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A bundled program with its main worker.
 */
export interface BundledProgram {
  id: string;
  name: string;
  description: string;
  /** The main.worker content */
  mainWorker: string;
}

/**
 * Bundled programs - each program has its main.worker.
 * Programs are derived from examples in the main golem-forge repo.
 */
export const BUNDLED_PROGRAMS: BundledProgram[] = [
  {
    id: 'greeter',
    name: 'Greeter',
    description: 'A friendly assistant that greets users',
    mainWorker: `---
name: greeter
description: A friendly assistant that greets users and responds to messages
---

You are a friendly and helpful assistant.

When the user provides a message:
1. Greet them warmly
2. Respond thoughtfully to their message
3. Be concise but friendly

Keep your responses brief and conversational.
`,
  },
  {
    id: 'calculator',
    name: 'Calculator',
    description: 'Mathematical calculator with scratch space',
    mainWorker: `---
name: calculator
description: Mathematical calculator assistant that performs calculations and explains results
toolsets:
  filesystem: {}
sandbox:
  restrict: /scratch
  approval:
    write: preApproved
    delete: preApproved
---

You are a mathematical calculator assistant that helps users with calculations.

**Available Tools:**
- \`write_file\`: Save calculation results to scratch files
- \`read_file\`: Read previous calculations
- \`list_files\`: View saved calculations

**Capabilities:**
- Basic arithmetic (addition, subtraction, multiplication, division)
- Fibonacci numbers: F(n) where F(0)=0, F(1)=1, F(n)=F(n-1)+F(n-2)
- Factorials: n! = n * (n-1) * ... * 1
- Prime factorization: Find all prime factors of a number
- Other mathematical calculations

**Instructions:**
1. When asked for a calculation, work through it step by step
2. Show your work clearly
3. Optionally save complex calculations to \`/scratch/\` for reference
4. Explain the result in a helpful way

**Examples:**
- "What is 15 factorial?" → Calculate 15! = 1,307,674,368,000
- "Fibonacci of 10" → F(10) = 55 (sequence: 0,1,1,2,3,5,8,13,21,34,55)
- "Prime factors of 84" → 84 = 2 × 2 × 3 × 7 = 2² × 3 × 7

Be precise with calculations. For very large numbers, explain any limitations.
`,
  },
  {
    id: 'note-taker',
    name: 'Note Taker',
    description: 'Save timestamped notes to a log file',
    mainWorker: `---
name: note_taker
description: Save timestamped notes to a log file with write approval
toolsets:
  filesystem: {}
sandbox:
  restrict: /notes
---

You are a note-taking assistant that maintains a log of timestamped notes.

When the user provides a note:
1. Format it as: \`YYYY-MM-DD HH:MM - {note text}\`
2. Read the existing notes from \`notes/activity.log\` (if it exists)
3. Append the new note to the existing content
4. Write the updated content back to \`notes/activity.log\`
5. Confirm the note was saved

If the log file doesn't exist, create it with the first note.

Available tools:
- \`read_file\`: Read existing notes
- \`write_file\`: Save notes (requires approval)
- \`file_exists\`: Check if log exists

Guidelines:
- Each note should be on its own line
- Use ISO date format for timestamps
- Preserve existing notes when adding new ones
`,
  },
  {
    id: 'file-manager',
    name: 'File Manager',
    description: 'Manage files in a sandboxed workspace',
    mainWorker: `---
name: file_manager
description: Manage files in a sandboxed workspace directory
toolsets:
  filesystem: {}
---

You are a file management assistant with access to a sandboxed workspace directory.

Available tools:
- \`read_file\`: Read contents of a file
- \`write_file\`: Write content to a file
- \`list_files\`: List files in a directory
- \`delete_file\`: Delete a file
- \`file_exists\`: Check if a file exists
- \`file_info\`: Get file metadata (size, dates)

When the user asks you to manage files:
1. Use the appropriate tool for the task
2. Confirm actions before making changes
3. Report results clearly

Guidelines:
- All file operations are within the sandbox
- Be careful with delete operations
- Provide helpful feedback on success/failure
`,
  },
  {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    description: 'Reviews code and provides feedback',
    mainWorker: `---
name: code-reviewer
description: Reviews code snippets and provides feedback
toolsets:
  filesystem: {}
sandbox:
  readonly: true
---

You are a code reviewer. When given code to review:

1. **Read the Code**: Use list_files and read_file to examine the code
2. **Identify Issues**: Look for bugs, security issues, and code smells
3. **Suggest Improvements**: Provide specific, actionable suggestions
4. **Rate the Code**: Give an overall quality score (1-10)

Be constructive and specific in your feedback.
`,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Worker Manager
// ─────────────────────────────────────────────────────────────────────────────

// Storage key for persisted GitHub workers
const GITHUB_WORKERS_STORAGE_KEY = 'githubWorkersCache';

/**
 * Worker Manager for the browser extension.
 *
 * Manages worker discovery and loading from:
 * - Bundled programs (included in extension)
 * - GitHub sources (fetched and cached in chrome.storage.local)
 */
export class WorkerManager {
  private cache = new Map<string, WorkerDefinition>();
  private githubWorkerCache = new Map<string, string>(); // sourceId:name -> content
  private initialized = false;

  /**
   * Initialize the worker manager by loading persisted GitHub workers.
   * Called lazily on first access that needs GitHub workers.
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    try {
      const result = await chrome.storage.local.get(GITHUB_WORKERS_STORAGE_KEY);
      const cached = result[GITHUB_WORKERS_STORAGE_KEY] as Record<string, string> | undefined;

      if (cached) {
        for (const [key, content] of Object.entries(cached)) {
          this.githubWorkerCache.set(key, content);
        }
        console.log(`[WorkerManager] Loaded ${Object.keys(cached).length} persisted GitHub workers`);
      }
    } catch (err) {
      console.warn('[WorkerManager] Failed to load persisted GitHub workers:', err);
    }

    this.initialized = true;
  }

  /**
   * Persist GitHub workers to chrome.storage.local.
   */
  private async persistGitHubWorkers(): Promise<void> {
    const data: Record<string, string> = {};
    for (const [key, content] of this.githubWorkerCache) {
      data[key] = content;
    }

    try {
      await chrome.storage.local.set({ [GITHUB_WORKERS_STORAGE_KEY]: data });
    } catch (err) {
      console.warn('[WorkerManager] Failed to persist GitHub workers:', err);
    }
  }

  /**
   * Get all bundled programs.
   */
  getBundledPrograms(): BundledProgram[] {
    return BUNDLED_PROGRAMS;
  }

  /**
   * Get the main worker for a bundled program.
   */
  getBundledProgramWorker(programId: string): WorkerDefinition {
    const cacheKey = `bundled:${programId}`;

    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const program = BUNDLED_PROGRAMS.find((p) => p.id === programId);
    if (!program) {
      throw new Error(`Bundled program not found: ${programId}`);
    }

    const result = parseWorkerString(program.mainWorker, `${programId}/main.worker`);
    if (!result.success) {
      throw new Error(result.error);
    }

    this.cache.set(cacheKey, result.worker);
    return result.worker;
  }

  /**
   * Check if a bundled program exists.
   */
  hasBundledProgram(programId: string): boolean {
    return BUNDLED_PROGRAMS.some((p) => p.id === programId);
  }

  /**
   * Get all available worker sources.
   */
  async getSources(): Promise<WorkerSource[]> {
    const sources = await programManager.listWorkerSources();

    // Always include the bundled source
    const bundledSource: WorkerSource = {
      type: 'bundled',
      id: 'bundled',
      name: 'Built-in Workers',
    };

    return [bundledSource, ...sources];
  }

  /**
   * List all workers from a source.
   */
  async listWorkers(sourceId: string): Promise<WorkerInfo[]> {
    if (sourceId === 'bundled') {
      return BUNDLED_PROGRAMS.map((program) => {
        const result = parseWorkerString(program.mainWorker);
        return {
          name: program.id,
          description: result.success ? result.worker.description : program.description,
          sourceId: 'bundled',
          sourceType: 'bundled' as const,
          path: 'main.worker',
        };
      });
    }

    // GitHub source - ensure persisted workers are loaded
    await this.ensureInitialized();

    const source = await programManager.getWorkerSource(sourceId);
    if (!source || source.type !== 'github') {
      return [];
    }

    // Return cached workers if available
    const workers: WorkerInfo[] = [];
    for (const [key, content] of this.githubWorkerCache) {
      if (key.startsWith(sourceId + ':')) {
        const name = key.slice(sourceId.length + 1);
        const parsed = parseWorkerString(content);
        workers.push({
          name,
          description: parsed.success ? parsed.worker.description : undefined,
          sourceId,
          sourceType: 'github',
          path: name,
        });
      }
    }

    return workers;
  }

  /**
   * Get a worker definition by source and name.
   */
  async getWorker(sourceId: string, workerId: string): Promise<WorkerDefinition> {
    const cacheKey = `${sourceId}:${workerId}`;

    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    let content: string;

    if (sourceId === 'bundled') {
      // For bundled source, workerId is the program ID
      const program = BUNDLED_PROGRAMS.find((p) => p.id === workerId);
      if (!program) {
        throw new Error(`Bundled program not found: ${workerId}`);
      }
      content = program.mainWorker;
    } else {
      // GitHub source - ensure persisted workers are loaded
      await this.ensureInitialized();

      const githubContent = this.githubWorkerCache.get(cacheKey);
      if (!githubContent) {
        throw new Error(`Worker not found: ${workerId} in source ${sourceId}. Try syncing the source first.`);
      }
      content = githubContent;
    }

    const result = parseWorkerString(content, workerId);
    if (!result.success) {
      throw new Error(result.error);
    }

    this.cache.set(cacheKey, result.worker);
    return result.worker;
  }

  /**
   * Sync workers from a GitHub source.
   *
   * Fetches all .worker files from the repository and caches them.
   */
  async syncGitHubSource(sourceId: string): Promise<void> {
    const source = await programManager.getWorkerSource(sourceId);
    if (!source || source.type !== 'github') {
      throw new Error(`GitHub source not found: ${sourceId}`);
    }

    const githubSource = source as GitHubWorkerSource;
    const token = await settingsManager.getGitHubToken();

    // Fetch contents from GitHub API
    const url = `https://api.github.com/repos/${githubSource.repo}/contents/${githubSource.path}?ref=${githubSource.branch}`;

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, { headers });

    if (!response.ok) {
      throw new Error(`Failed to fetch from GitHub: ${response.statusText}`);
    }

    const contents = await response.json() as Array<{
      name: string;
      type: string;
      download_url: string;
    }>;

    // Filter for .worker files
    const workerFiles = contents.filter(
      (item) => item.type === 'file' && item.name.endsWith('.worker')
    );

    // Fetch each worker file
    for (const file of workerFiles) {
      const fileResponse = await fetch(file.download_url);
      if (fileResponse.ok) {
        const content = await fileResponse.text();
        const name = file.name.replace('.worker', '');
        this.githubWorkerCache.set(`${sourceId}:${name}`, content);
        // Clear parsed cache
        this.cache.delete(`${sourceId}:${name}`);
      }
    }

    // Persist synced workers to chrome.storage.local
    await this.persistGitHubWorkers();

    // Update last sync timestamp
    await programManager.updateWorkerSource(sourceId, {
      lastSync: Date.now(),
    });

    console.log(`[WorkerManager] Synced ${workerFiles.length} workers from source ${sourceId}`);
  }

  /**
   * Clear all caches (both in-memory and persisted).
   */
  async clearCache(): Promise<void> {
    this.cache.clear();
    this.githubWorkerCache.clear();
    this.initialized = false;

    // Also clear persisted cache
    try {
      await chrome.storage.local.remove(GITHUB_WORKERS_STORAGE_KEY);
    } catch (err) {
      console.warn('[WorkerManager] Failed to clear persisted GitHub workers:', err);
    }
  }
}

// Singleton instance
export const workerManager = new WorkerManager();
