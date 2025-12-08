/**
 * Tests for Replay Client
 *
 * The replay-client module re-exports AI SDK's MockLanguageModelV2.
 * See AI SDK documentation for usage:
 * https://ai-sdk.dev/docs/ai-sdk-core/testing
 */

import { describe, it, expect } from "vitest";
import { MockLanguageModelV3, mockValues } from "./replay-client.js";

describe("MockLanguageModelV3", () => {
  it("re-exports AI SDK MockLanguageModelV3", () => {
    expect(MockLanguageModelV3).toBeDefined();
  });

  it("re-exports mockValues helper", () => {
    expect(mockValues).toBeDefined();
  });
});
