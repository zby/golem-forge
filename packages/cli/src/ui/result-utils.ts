/**
 * Result Utilities (CLI shim)
 *
 * The platform-agnostic implementation lives in @golem-forge/core.
 */

import {
  WELL_KNOWN_KINDS,
  isValidKind,
  isWellKnownKind,
  isToolResultValue,
  toToolResultEvent,
  isSuccessResult,
  type WellKnownKind,
} from "@golem-forge/core";

export { WELL_KNOWN_KINDS, isValidKind, isWellKnownKind, isToolResultValue, isSuccessResult };
export type { WellKnownKind };

export function toTypedToolResult(
  toolName: string,
  toolCallId: string,
  output: unknown,
  isError: boolean,
  durationMs: number
) {
  return toToolResultEvent({ toolName, toolCallId, output, isError, durationMs });
}

