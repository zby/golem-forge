/**
 * Tool Info Utility
 *
 * Extracts ManualToolInfo from NamedTool definitions.
 * Used to build the manual tool list for UI display.
 */

import type { NamedTool } from "../tools/filesystem.js";
import type { ManualToolInfo, ManualToolField } from "./types.js";
import { deriveFieldsFromSchema, isZodObjectSchema } from "./schema-to-fields.js";

/**
 * Extract ManualToolInfo from a NamedTool.
 *
 * @param tool - The tool to extract info from
 * @returns ManualToolInfo or null if tool is not manually invokable
 */
export function extractManualToolInfo(tool: NamedTool): ManualToolInfo | null {
  const config = tool.manualExecution;

  // Skip tools that are LLM-only
  if (!config || config.mode === "llm") {
    return null;
  }

  // Extract fields from input schema
  let fields: ManualToolField[] = [];
  if (isZodObjectSchema(tool.inputSchema)) {
    fields = deriveFieldsFromSchema(tool.inputSchema);
  }

  return {
    name: tool.name,
    label: config.label || tool.name,
    description: tool.description || "",
    category: config.category,
    fields,
  };
}

/**
 * Filter tools to get only manual-invokable ones.
 *
 * @param tools - Record of tool name to NamedTool
 * @returns Array of ManualToolInfo
 */
export function getManualTools(tools: Record<string, NamedTool>): ManualToolInfo[] {
  const manualTools: ManualToolInfo[] = [];

  for (const tool of Object.values(tools)) {
    const info = extractManualToolInfo(tool);
    if (info) {
      manualTools.push(info);
    }
  }

  return manualTools;
}

/**
 * Filter tools to get only LLM-invokable ones.
 * These are tools with mode='llm' or mode='both'.
 *
 * @param tools - Record of tool name to NamedTool
 * @returns Record of LLM-invokable tools
 */
export function getLLMTools(tools: Record<string, NamedTool>): Record<string, NamedTool> {
  const llmTools: Record<string, NamedTool> = {};

  for (const [name, tool] of Object.entries(tools)) {
    const mode = tool.manualExecution?.mode;

    // Include tool if:
    // - No manual execution config (default is LLM)
    // - Mode is 'llm' or 'both'
    if (!mode || mode === "llm" || mode === "both") {
      llmTools[name] = tool;
    }
  }

  return llmTools;
}

/**
 * Check if a tool can be manually invoked.
 *
 * @param tool - The tool to check
 * @returns true if tool has mode='manual' or mode='both'
 */
export function isManualTool(tool: NamedTool): boolean {
  const mode = tool.manualExecution?.mode;
  return mode === "manual" || mode === "both";
}

/**
 * Check if a tool can be LLM-invoked.
 *
 * @param tool - The tool to check
 * @returns true if tool has mode='llm' or mode='both' or no config (default)
 */
export function isLLMTool(tool: NamedTool): boolean {
  const mode = tool.manualExecution?.mode;
  return !mode || mode === "llm" || mode === "both";
}
