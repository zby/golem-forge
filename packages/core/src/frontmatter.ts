/**
 * Frontmatter Parser
 *
 * Extracts YAML frontmatter from markdown-style content.
 * Zero external dependencies beyond the `yaml` package.
 *
 * @module @golem-forge/core/frontmatter
 */

import { parse as parseYaml } from 'yaml';

const FRONTMATTER_REGEX = /^---[ \t]*\r?\n([\s\S]*?)\r?\n?---[ \t]*\r?\n?([\s\S]*)$/;

export interface FrontmatterResult {
  data: Record<string, unknown>;
  content: string;
}

/**
 * Parse frontmatter from content.
 *
 * @param content - The raw content with optional YAML frontmatter
 * @returns Object with parsed data and remaining content
 */
export function parseFrontmatter(content: string): FrontmatterResult {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) {
    return { data: {}, content: content.trim() };
  }
  const [, yamlContent, body] = match;
  const data = (parseYaml(yamlContent) as Record<string, unknown>) ?? {};
  return { data, content: body.trim() };
}
