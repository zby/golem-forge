/**
 * Manual Tool Info Utilities (UI)
 *
 * Converts tool definitions to UI-friendly manual tool descriptors.
 */

import type { NamedTool } from "../tools/base.js";
import type { ManualToolInfoEvent } from "../ui-events.js";
import { deriveFieldsFromSchema, isZodObjectSchema } from "./schema-to-fields.js";

/**
 * Extract a ManualToolInfoEvent from a NamedTool.
 *
 * Returns null when the tool cannot be manually invoked.
 */
export function extractManualToolInfo(tool: NamedTool): ManualToolInfoEvent | null {
  const config = tool.manualExecution;

  if (!config || config.mode === "llm") {
    return null;
  }

  let fields: ManualToolInfoEvent["fields"] = [];
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
 * Get ManualToolInfoEvent[] for all manually-invokable tools.
 */
export function getManualToolInfos(tools: Record<string, NamedTool>): ManualToolInfoEvent[] {
  const manualTools: ManualToolInfoEvent[] = [];

  for (const tool of Object.values(tools)) {
    const info = extractManualToolInfo(tool);
    if (info) {
      manualTools.push(info);
    }
  }

  return manualTools;
}

