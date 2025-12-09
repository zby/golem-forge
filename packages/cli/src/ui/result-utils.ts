/**
 * Result Utilities
 *
 * Utilities for detecting and converting tool results to typed format.
 */

import type { ToolResultValue, TypedToolResult } from "./types.js";

/**
 * Valid kinds for ToolResultValue.
 */
const VALID_KINDS = ["text", "diff", "file_content", "file_list", "json"] as const;

/**
 * Check if a value is a structured ToolResultValue.
 *
 * @param value - Value to check
 * @returns True if value has a valid `kind` discriminator
 */
export function isToolResultValue(value: unknown): value is ToolResultValue {
  if (!value || typeof value !== "object") {
    return false;
  }

  const obj = value as Record<string, unknown>;

  if (typeof obj.kind !== "string") {
    return false;
  }

  return (VALID_KINDS as readonly string[]).includes(obj.kind);
}

/**
 * Convert a tool execution result to a TypedToolResult.
 *
 * If the output is already a ToolResultValue, it's used directly.
 * Otherwise, it's wrapped as a JSON result.
 *
 * @param toolName - Name of the tool
 * @param toolCallId - Tool call ID
 * @param output - Raw tool output
 * @param isError - Whether the execution errored
 * @param durationMs - Execution duration in ms
 * @returns TypedToolResult suitable for RuntimeUI.showToolResult
 */
export function toTypedToolResult(
  toolName: string,
  toolCallId: string,
  output: unknown,
  isError: boolean,
  durationMs: number
): TypedToolResult {
  // Handle error case
  if (isError) {
    const errorMsg = typeof output === "string"
      ? output
      : output && typeof output === "object" && "error" in output
        ? String((output as { error: unknown }).error)
        : "Unknown error";

    return {
      toolName,
      toolCallId,
      status: "error",
      error: errorMsg,
      durationMs,
    };
  }

  // Check if output is already a structured result
  if (isToolResultValue(output)) {
    return {
      toolName,
      toolCallId,
      status: "success",
      value: output,
      durationMs,
    };
  }

  // Check for legacy FilesystemToolResult pattern with success field
  if (output && typeof output === "object" && "success" in output) {
    const legacyResult = output as { success: boolean; error?: string; [key: string]: unknown };

    if (!legacyResult.success && legacyResult.error) {
      return {
        toolName,
        toolCallId,
        status: "error",
        error: legacyResult.error,
        durationMs,
      };
    }
  }

  // Wrap as JSON result
  return {
    toolName,
    toolCallId,
    status: "success",
    value: {
      kind: "json",
      data: output,
    },
    durationMs,
  };
}

/**
 * Check if a result indicates the tool execution was successful.
 *
 * Works with both TypedToolResult and legacy result patterns.
 */
export function isSuccessResult(result: unknown): boolean {
  if (!result || typeof result !== "object") {
    return false;
  }

  const obj = result as Record<string, unknown>;

  // TypedToolResult pattern
  if ("status" in obj) {
    return obj.status === "success";
  }

  // Legacy pattern
  if ("success" in obj) {
    return obj.success === true;
  }

  // Assume success if neither pattern matches
  return true;
}
