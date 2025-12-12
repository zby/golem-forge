/**
 * UI Result Utilities
 *
 * Helpers for working with structured tool result values and tool result events.
 */

import { isToolResultValue } from "../ui-events.js";
import type { ToolResultEvent, ToolResultValue, WellKnownKind } from "../ui-events.js";
import { WELL_KNOWN_KINDS, isValidKind, isWellKnownKind } from "../ui-events.js";

export { WELL_KNOWN_KINDS, isValidKind, isWellKnownKind, isToolResultValue };
export type { WellKnownKind };

/**
 * Convert a tool execution output to a ToolResultEvent.
 *
 * If the output is already a ToolResultValue, it's used directly.
 * Otherwise, it's wrapped as a JSON result.
 *
 * Note: This helper does not know the tool args; it sets `args` to `{}`.
 */
export function toToolResultEvent(options: {
  toolName: string;
  toolCallId: string;
  output: unknown;
  isError: boolean;
  durationMs: number;
}): ToolResultEvent {
  const { toolName, toolCallId, output, isError, durationMs } = options;

  if (isError) {
    const errorMsg =
      typeof output === "string"
        ? output
        : output && typeof output === "object" && "error" in output
          ? String((output as { error: unknown }).error)
          : "Unknown error";

    return {
      toolName,
      toolCallId,
      args: {},
      status: "error",
      error: errorMsg,
      durationMs,
    };
  }

  if (isToolResultValue(output)) {
    return {
      toolName,
      toolCallId,
      args: {},
      status: "success",
      value: output,
      durationMs,
    };
  }

  // Legacy pattern: { success: boolean, error?: string }
  if (output && typeof output === "object" && "success" in output) {
    const legacyResult = output as { success: boolean; error?: string };

    if (!legacyResult.success && legacyResult.error) {
      return {
        toolName,
        toolCallId,
        args: {},
        status: "error",
        error: legacyResult.error,
        durationMs,
      };
    }
  }

  const wrapped: ToolResultValue = { kind: "json", data: output };
  return {
    toolName,
    toolCallId,
    args: {},
    status: "success",
    value: wrapped,
    durationMs,
  };
}

/**
 * Check if a result indicates the tool execution was successful.
 */
export function isSuccessResult(result: unknown): boolean {
  if (!result || typeof result !== "object") {
    return false;
  }

  const obj = result as Record<string, unknown>;

  if ("status" in obj) {
    return obj.status === "success";
  }

  if ("success" in obj) {
    return obj.success === true;
  }

  return true;
}

