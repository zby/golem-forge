/**
 * Integration Test Helpers
 *
 * Utilities for running integration tests with replay or live LLM.
 */

import { lemmy, type ChatClient } from '@mariozechner/lemmy';
import { ReplayClient, type RecordedResponse } from './replay-client.js';

/**
 * Check if live tests should run.
 */
export function shouldRunLiveTests(): boolean {
  return process.env.RUN_LIVE_TESTS === '1';
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
 * Get a client for integration tests.
 * Returns live client if RUN_LIVE_TESTS=1, otherwise returns replay client.
 */
export function getTestClient(options: {
  /** Responses for replay mode */
  replayResponses: RecordedResponse[];
  /** Model to use in live mode (default: claude-3-5-haiku-20241022) */
  liveModel?: string;
}): ChatClient {
  if (shouldRunLiveTests()) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY required for live tests');
    }
    return lemmy.anthropic({
      apiKey,
      model: options.liveModel ?? 'claude-3-5-haiku-20241022',
    });
  }

  return new ReplayClient({ responses: options.replayResponses });
}

/**
 * Decorator for tests that can run in both replay and live mode.
 * Records the response pattern for documentation.
 */
export interface DualModeTest {
  /** Description of expected behavior */
  description: string;
  /** Responses for replay mode */
  replayResponses: RecordedResponse[];
  /** The test function */
  test: (client: ChatClient) => Promise<void>;
}

/**
 * Run a test in either replay or live mode.
 */
export async function runDualModeTest(config: DualModeTest): Promise<void> {
  const client = getTestClient({ replayResponses: config.replayResponses });
  await config.test(client);
}
