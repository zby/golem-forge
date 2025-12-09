/**
 * Worker Manager
 *
 * Manages worker definitions in the browser extension.
 * Unlike CLI's WorkerRegistry (filesystem-based), this uses:
 * - Bundled workers (included in extension)
 * - GitHub-fetched workers (cached in OPFS)
 *
 * The output is the same WorkerDefinition type, but discovery is different.
 */

import {
  WorkerDefinitionSchema,
  type WorkerDefinition,
  type ParseResult,
  type ParseError,
  type ParseWorkerResult,
} from '@golem-forge/core';
import type { WorkerSource, GitHubWorkerSource } from '../storage/types';
import { projectManager } from '../storage/project-manager';
import { settingsManager } from '../storage/settings-manager';

// ─────────────────────────────────────────────────────────────────────────────
// Browser-compatible YAML Frontmatter Parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simple YAML parser for frontmatter.
 * Handles basic YAML structures used in worker files.
 * Does not require Node.js Buffer like gray-matter.
 */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');

  // Stack tracks the current context: { indent, container, currentKey }
  // container is the object/array we're adding to
  // currentKey is the key whose value we're populating (for nested structures)
  const stack: Array<{ indent: number; container: Record<string, unknown>; currentKey?: string }> = [
    { indent: -1, container: result },
  ];

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];

    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) continue;

    // Calculate indentation
    const indent = line.search(/\S/);
    const content = line.trim();

    // Pop stack until we find parent with smaller indent
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];

    // Determine which object to write to
    // If parent has a currentKey, we write to the nested object at that key
    const targetObj = parent.currentKey
      ? parent.container[parent.currentKey] as Record<string, unknown>
      : parent.container;

    // Check if it's a list item
    if (content.startsWith('- ')) {
      const value = content.slice(2).trim();
      if (parent.currentKey && Array.isArray(parent.container[parent.currentKey])) {
        // Parse the value
        (parent.container[parent.currentKey] as unknown[]).push(parseYamlValue(value));
      }
      continue;
    }

    // Parse key: value
    const colonIndex = content.indexOf(':');
    if (colonIndex === -1) continue;

    const key = content.slice(0, colonIndex).trim();
    const valueStr = content.slice(colonIndex + 1).trim();

    if (valueStr === '' || valueStr === '{}') {
      // Empty object or will have nested content
      let newValue: Record<string, unknown> | unknown[];

      if (valueStr === '{}') {
        newValue = {};
      } else {
        // Check next line to determine if it's an array or object
        const nextLineIndex = lineIndex + 1;
        if (nextLineIndex < lines.length) {
          const nextLine = lines[nextLineIndex].trim();
          if (nextLine.startsWith('- ')) {
            newValue = [];
          } else {
            newValue = {};
          }
        } else {
          newValue = {};
        }
      }

      targetObj[key] = newValue;

      // Push new context for nested content
      if (!Array.isArray(newValue)) {
        stack.push({ indent, container: targetObj, currentKey: key });
      } else {
        stack.push({ indent, container: targetObj, currentKey: key });
      }
    } else {
      // Simple value
      targetObj[key] = parseYamlValue(valueStr);
    }
  }

  return result;
}

/**
 * Parse a YAML value string into its JavaScript type.
 */
function parseYamlValue(value: string): unknown {
  // Remove quotes
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }

  // Boolean
  if (value === 'true') return true;
  if (value === 'false') return false;

  // Null
  if (value === 'null' || value === '~') return null;

  // Number
  const num = Number(value);
  if (!isNaN(num) && value !== '') return num;

  // String
  return value;
}

/**
 * Parse frontmatter from a worker file content.
 * Browser-compatible alternative to gray-matter.
 */
function parseFrontmatter(content: string): { data: Record<string, unknown>; content: string } {
  const frontmatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    // No frontmatter, return empty data
    return { data: {}, content: content.trim() };
  }

  const yamlContent = match[1];
  const bodyContent = match[2];

  try {
    const data = parseSimpleYaml(yamlContent);
    return { data, content: bodyContent.trim() };
  } catch {
    return { data: {}, content: content.trim() };
  }
}

// Re-export types for convenience
export type { WorkerDefinition, ParseResult, ParseError, ParseWorkerResult };

/**
 * Parse a .worker file from a string.
 * Browser-compatible parser - does not use Node.js Buffer.
 */
export function parseWorkerString(content: string, filePath?: string): ParseWorkerResult {
  const fileContext = filePath ? ` in ${filePath}` : '';

  try {
    const parsed = parseFrontmatter(content);
    const result = WorkerDefinitionSchema.safeParse({
      ...parsed.data,
      instructions: parsed.content.trim(),
    });

    if (!result.success) {
      return {
        success: false,
        error: `Invalid worker definition${fileContext}`,
        details: result.error,
      };
    }

    return {
      success: true,
      worker: result.data,
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse worker file${fileContext}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

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
// Bundled Projects
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A bundled project with its main worker.
 */
export interface BundledProject {
  id: string;
  name: string;
  description: string;
  /** The main.worker content */
  mainWorker: string;
}

/**
 * Bundled projects - each project has its main.worker.
 * Projects are derived from examples in the main golem-forge repo.
 */
export const BUNDLED_PROJECTS: BundledProject[] = [
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

/**
 * Worker Manager for the browser extension.
 *
 * Manages worker discovery and loading from:
 * - Bundled projects (included in extension)
 * - GitHub sources (fetched and cached)
 */
export class WorkerManager {
  private cache = new Map<string, WorkerDefinition>();
  private githubWorkerCache = new Map<string, string>(); // sourceId:name -> content

  /**
   * Get all bundled projects.
   */
  getBundledProjects(): BundledProject[] {
    return BUNDLED_PROJECTS;
  }

  /**
   * Get the index worker for a bundled project.
   */
  getBundledProjectWorker(projectId: string): WorkerDefinition {
    const cacheKey = `bundled:${projectId}`;

    // Check cache first
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    const project = BUNDLED_PROJECTS.find((p) => p.id === projectId);
    if (!project) {
      throw new Error(`Bundled project not found: ${projectId}`);
    }

    const result = parseWorkerString(project.mainWorker, `${projectId}/main.worker`);
    if (!result.success) {
      throw new Error(result.error);
    }

    this.cache.set(cacheKey, result.worker);
    return result.worker;
  }

  /**
   * Check if a bundled project exists.
   */
  hasBundledProject(projectId: string): boolean {
    return BUNDLED_PROJECTS.some((p) => p.id === projectId);
  }

  /**
   * Get all available worker sources.
   */
  async getSources(): Promise<WorkerSource[]> {
    const sources = await projectManager.listWorkerSources();

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
      return BUNDLED_PROJECTS.map((project) => {
        const result = parseWorkerString(project.mainWorker);
        return {
          name: project.id,
          description: result.success ? result.worker.description : project.description,
          sourceId: 'bundled',
          sourceType: 'bundled' as const,
          path: 'main.worker',
        };
      });
    }

    // GitHub source
    const source = await projectManager.getWorkerSource(sourceId);
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
      // For bundled source, workerId is the project ID
      const project = BUNDLED_PROJECTS.find((p) => p.id === workerId);
      if (!project) {
        throw new Error(`Bundled project not found: ${workerId}`);
      }
      content = project.mainWorker;
    } else {
      // GitHub source
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
    const source = await projectManager.getWorkerSource(sourceId);
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

    // Update last sync timestamp
    await projectManager.updateWorkerSource(sourceId, {
      lastSync: Date.now(),
    });
  }

  /**
   * Clear all caches.
   */
  clearCache(): void {
    this.cache.clear();
    this.githubWorkerCache.clear();
  }
}

// Singleton instance
export const workerManager = new WorkerManager();
