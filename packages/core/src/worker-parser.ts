/**
 * Worker File Parser
 *
 * Parses .worker files using frontmatter extraction and Zod validation.
 * Platform-agnostic - used by both CLI and browser extension.
 *
 * @module @golem-forge/core/worker-parser
 */

import { parseFrontmatter } from './frontmatter.js';
import { WorkerDefinitionSchema, type ParseWorkerResult } from './worker-schema.js';

/**
 * Parse a .worker file from a string.
 *
 * @param content - The raw content of the .worker file
 * @param filePath - Optional file path for better error context
 * @returns ParseWorkerResult with either the parsed worker or an error
 */
export function parseWorkerString(content: string, filePath?: string): ParseWorkerResult {
  const fileContext = filePath ? ` in ${filePath}` : '';

  try {
    const { data, content: body } = parseFrontmatter(content);

    const result = WorkerDefinitionSchema.safeParse({
      ...data,
      instructions: body,
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
