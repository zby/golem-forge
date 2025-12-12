/**
 * Tool Info Utility (CLI shim)
 *
 * The platform-agnostic implementation lives in @golem-forge/core.
 */

import { extractManualToolInfo, getManualToolInfos, getLLMTools, isLLMTool, isManualTool } from "@golem-forge/core";
import type { NamedTool } from "@golem-forge/core";
import type { ManualToolInfoEvent } from "@golem-forge/core";

export { getLLMTools, isLLMTool, isManualTool, extractManualToolInfo };

/**
 * Back-compat helper: return a list (not a map) for UI rendering.
 */
export function getManualTools(tools: Record<string, NamedTool>): ManualToolInfoEvent[] {
  return getManualToolInfos(tools);
}

