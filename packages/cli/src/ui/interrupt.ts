/**
 * Interrupt Signal
 *
 * Provides a mechanism for interrupting tool execution.
 * Used by the UI layer to signal interruption to the tool loop.
 */

import type { InterruptSignal } from "./types.js";

/**
 * Create an interrupt signal.
 *
 * The signal can be checked by the tool loop to detect interruption
 * and gracefully terminate execution.
 *
 * @example
 * ```typescript
 * const signal = createInterruptSignal();
 *
 * // In UI layer (e.g., on Esc key)
 * signal.interrupt();
 *
 * // In tool loop
 * if (signal.interrupted) {
 *   return { type: 'interrupted' };
 * }
 * ```
 */
export function createInterruptSignal(): InterruptSignal {
  let interrupted = false;

  return {
    get interrupted(): boolean {
      return interrupted;
    },

    interrupt(): void {
      interrupted = true;
    },

    reset(): void {
      interrupted = false;
    },
  };
}

/**
 * Error thrown when execution is interrupted.
 */
export class InterruptError extends Error {
  constructor(message: string = "Execution interrupted") {
    super(message);
    this.name = "InterruptError";
  }
}

/**
 * Check if an error is an interrupt error.
 */
export function isInterruptError(error: unknown): error is InterruptError {
  return error instanceof InterruptError;
}
