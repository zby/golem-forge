/**
 * Tool Info Utility
 *
 * Extracts ManualToolInfo from NamedTool definitions.
 * Used to build the manual tool list for UI display.
 *
 * Note: Core tool filtering functions (getLLMTools, getManualTools, isLLMTool, isManualTool)
 * are re-exported from @golem-forge/core. This file focuses on CLI-specific UI concerns
 * like extractManualToolInfo which converts tools to ManualToolInfo for UI display.
 */

import {
  type NamedTool,
  // Re-export core tool filtering functions
  getLLMTools as coreLLMTools,
  isLLMTool,
  isManualTool,
} from "@golem-forge/core";
import type { ManualToolInfo, ManualToolField } from "./types.js";
import { deriveFieldsFromSchema, isZodObjectSchema } from "./schema-to-fields.js";

// Re-export core filtering functions for backwards compatibility
export { isLLMTool, isManualTool };
export const getLLMTools = coreLLMTools;

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
 * Get ManualToolInfo for all manually-invokable tools.
 * This is the CLI-specific version that returns ManualToolInfo[] for UI display.
 *
 * @param tools - Record of tool name to NamedTool
 * @returns Array of ManualToolInfo for UI rendering
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
