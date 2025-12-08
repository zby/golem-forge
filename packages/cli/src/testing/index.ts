/**
 * Testing Utilities
 *
 * Mock models and helpers for testing LLM interactions.
 * Uses Vercel AI SDK's built-in MockLanguageModelV2.
 */

export {
  MockLanguageModelV3,
  mockValues,
  convertArrayToReadableStream,
  mockId,
} from "./replay-client.js";

export {
  shouldRunLiveTests,
  skipIfNotLive,
  skipIfLive,
  getLiveModel,
} from "./integration-helpers.js";
