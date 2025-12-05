/**
 * Integration Test Helpers
 *
 * Utilities for running integration tests with replay or live LLM.
 */

import type { LanguageModelV3 } from "@ai-sdk/provider";
import { anthropic } from "@ai-sdk/anthropic";

/**
 * Check if live tests should run.
 */
export function shouldRunLiveTests(): boolean {
  return process.env.RUN_LIVE_TESTS === "1";
}

/**
 * Skip test if not running live tests.
 * Use in describe.skipIf() or it.skipIf()
 */
export const skipIfNotLive = !shouldRunLiveTests();

/**
 * Skip test if running live tests (for replay-only tests).
 */
export const skipIfLive = shouldRunLiveTests();

/**
 * Get a live model for integration tests.
 * Only use when RUN_LIVE_TESTS=1.
 */
export function getLiveModel(modelId?: string): LanguageModelV3 {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY required for live tests");
  }
  return anthropic(modelId ?? "claude-3-5-haiku-20241022");
}
