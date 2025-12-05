/**
 * Testing Utilities
 *
 * Mock clients and helpers for testing LLM interactions.
 */

export {
  ReplayClient,
  replayClient,
  textResponse,
  toolCallResponse,
  errorResponse,
  createAskResult,
  type RecordedResponse,
  type SimpleResponse,
  type ReplayClientConfig,
  type ReplayClientBuilder,
} from './replay-client.js';

export {
  shouldRunLiveTests,
  skipIfNotLive,
  skipIfLive,
  getTestClient,
  runDualModeTest,
  type DualModeTest,
} from './integration-helpers.js';
