/**
 * Interrupt Signal Tests
 */

import { describe, it, expect } from "vitest";
import {
  createInterruptSignal,
  InterruptError,
  isInterruptError,
} from "./interrupt.js";

describe("createInterruptSignal", () => {
  it("starts not interrupted", () => {
    const signal = createInterruptSignal();
    expect(signal.interrupted).toBe(false);
  });

  it("can be interrupted", () => {
    const signal = createInterruptSignal();
    signal.interrupt();
    expect(signal.interrupted).toBe(true);
  });

  it("can be reset", () => {
    const signal = createInterruptSignal();
    signal.interrupt();
    expect(signal.interrupted).toBe(true);
    signal.reset();
    expect(signal.interrupted).toBe(false);
  });

  it("interrupt is idempotent", () => {
    const signal = createInterruptSignal();
    signal.interrupt();
    signal.interrupt();
    signal.interrupt();
    expect(signal.interrupted).toBe(true);
  });
});

describe("InterruptError", () => {
  it("creates error with default message", () => {
    const error = new InterruptError();
    expect(error.message).toBe("Execution interrupted");
    expect(error.name).toBe("InterruptError");
  });

  it("creates error with custom message", () => {
    const error = new InterruptError("User cancelled");
    expect(error.message).toBe("User cancelled");
  });
});

describe("isInterruptError", () => {
  it("returns true for InterruptError", () => {
    const error = new InterruptError();
    expect(isInterruptError(error)).toBe(true);
  });

  it("returns false for other errors", () => {
    const error = new Error("Some error");
    expect(isInterruptError(error)).toBe(false);
  });

  it("returns false for non-errors", () => {
    expect(isInterruptError("string")).toBe(false);
    expect(isInterruptError(null)).toBe(false);
    expect(isInterruptError(undefined)).toBe(false);
  });
});
