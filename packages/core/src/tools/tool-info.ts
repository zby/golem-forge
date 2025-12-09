/**
 * Tool Info Utilities
 *
 * Functions for filtering tools based on execution mode.
 * Used by WorkerRuntime to determine which tools to expose to the LLM.
 */

import type { NamedTool } from "./base.js";

/**
 * Filter tools to get only LLM-invokable ones.
 * These are tools with mode='llm' or mode='both' or no config (default).
 *
 * @param tools - Record of tool name to NamedTool
 * @returns Record of LLM-invokable tools
 */
export function getLLMTools(tools: Record<string, NamedTool>): Record<string, NamedTool> {
  const llmTools: Record<string, NamedTool> = {};

  for (const [name, tool] of Object.entries(tools)) {
    if (isLLMTool(tool)) {
      llmTools[name] = tool;
    }
  }

  return llmTools;
}

/**
 * Filter tools to get only manual-invokable ones.
 * These are tools with mode='manual' or mode='both'.
 *
 * @param tools - Record of tool name to NamedTool
 * @returns Record of manual-invokable tools
 */
export function getManualTools(tools: Record<string, NamedTool>): Record<string, NamedTool> {
  const manualTools: Record<string, NamedTool> = {};

  for (const [name, tool] of Object.entries(tools)) {
    if (isManualTool(tool)) {
      manualTools[name] = tool;
    }
  }

  return manualTools;
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
