/**
 * Worker File Parser
 *
 * Parses .worker files using gray-matter for frontmatter extraction
 * and Zod for schema validation.
 */

import matter from "gray-matter";
import { readFile } from "fs/promises";
import {
  WorkerDefinitionSchema,
  type ParseWorkerResult,
} from "./schema.js";

/**
 * Parse a .worker file from a string.
 *
 * @param content - The raw content of the .worker file
 * @returns ParseWorkerResult with either the parsed worker or an error
 */
export function parseWorkerString(content: string): ParseWorkerResult {
  try {
    // Extract frontmatter and body using gray-matter
    const parsed = matter(content);

    // Combine frontmatter with instructions and validate in one pass
    const result = WorkerDefinitionSchema.safeParse({
      ...parsed.data,
      instructions: parsed.content.trim(),
    });

    if (!result.success) {
      return {
        success: false,
        error: "Invalid worker definition",
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
      error: `Failed to parse worker file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Parse a .worker file from a file path.
 *
 * @param filePath - Path to the .worker file
 * @returns ParseWorkerResult with either the parsed worker or an error
 */
export async function parseWorkerFile(filePath: string): Promise<ParseWorkerResult> {
  try {
    const content = await readFile(filePath, "utf-8");
    return parseWorkerString(content);
  } catch (err) {
    return {
      success: false,
      error: `Failed to read worker file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Format a parse error for display.
 */
export function formatParseError(result: ParseWorkerResult): string {
  if (result.success) {
    return "No error";
  }

  let message = result.error;

  if (result.details) {
    const issues = result.details.issues.map((issue) => {
      const path = issue.path.join(".");
      return `  - ${path ? `${path}: ` : ""}${issue.message}`;
    });
    message += "\n" + issues.join("\n");
  }

  return message;
}
