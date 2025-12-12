/**
 * Interrupt Signal
 *
 * Provides a mechanism for interrupting execution.
 */

import type { InterruptSignal } from "./types.js";

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

export class InterruptError extends Error {
  constructor(message: string = "Execution interrupted") {
    super(message);
    this.name = "InterruptError";
  }
}

export function isInterruptError(error: unknown): error is InterruptError {
  return error instanceof InterruptError;
}

