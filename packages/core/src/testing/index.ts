/**
 * @golem-forge/core/testing
 *
 * Testing utilities that wrap/re-export AI SDK test helpers.
 * Platform packages (CLI/Chrome) should import these from core to avoid
 * direct dependency on AI SDK test entrypoints.
 */

export {
  MockLanguageModelV3,
  mockValues,
  convertArrayToReadableStream,
  mockId,
} from "ai/test";

