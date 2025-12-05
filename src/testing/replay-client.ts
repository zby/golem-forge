/**
 * Replay Client for Testing
 *
 * A mock ChatClient that replays pre-recorded responses instead of calling a live LLM.
 * Useful for deterministic tests without API costs.
 */

import type {
  ChatClient,
  AskResult,
  AskInput,
  AskOptions,
  StreamingCallbacks,
  AssistantMessage,
  TokenUsage,
  StopReason,
  ToolCall,
} from '@mariozechner/lemmy';

/**
 * A single recorded response for replay.
 */
export interface RecordedResponse {
  /** Optional pattern to match against input (if not provided, matches in sequence) */
  inputPattern?: string | RegExp;
  /** The response to return */
  response: AskResult;
}

/**
 * Simplified response for common test cases.
 */
export interface SimpleResponse {
  /** Text content to return */
  content?: string;
  /** Tool calls to return */
  toolCalls?: ToolCall[];
  /** Stop reason (defaults to 'complete') */
  stopReason?: StopReason;
}

/**
 * Configuration for ReplayClient.
 */
export interface ReplayClientConfig {
  /** Model name to report */
  model?: string;
  /** Provider name to report */
  provider?: string;
  /** Pre-recorded responses */
  responses?: RecordedResponse[];
  /** Whether to throw when responses are exhausted (default: true) */
  throwOnExhausted?: boolean;
  /** Default response when no match found (only if throwOnExhausted is false) */
  defaultResponse?: AskResult;
}

/**
 * Create an AskResult from a simple response.
 */
export function createAskResult(simple: SimpleResponse): AskResult {
  const message: AssistantMessage = {
    role: 'assistant',
    content: simple.content,
    toolCalls: simple.toolCalls,
    timestamp: new Date(),
    usage: { input: 0, output: 0 },
    provider: 'replay',
    model: 'replay',
    took: 0,
  };

  return {
    type: 'success',
    stopReason: simple.stopReason ?? (simple.toolCalls ? 'tool_call' : 'complete'),
    message,
    tokens: { input: 0, output: 0 },
    cost: 0,
  };
}

/**
 * Create a simple text response.
 */
export function textResponse(content: string): AskResult {
  return createAskResult({ content });
}

/**
 * Create a tool call response.
 */
export function toolCallResponse(toolCalls: ToolCall[]): AskResult {
  return createAskResult({ toolCalls, stopReason: 'tool_call' });
}

/**
 * Create an error response.
 */
export function errorResponse(message: string, type: 'rate_limit' | 'auth' | 'network' | 'api_error' | 'invalid_request' = 'api_error'): AskResult {
  return {
    type: 'error',
    error: {
      type,
      message,
      retryable: type === 'rate_limit' || type === 'network',
    },
  };
}

/**
 * A ChatClient that replays pre-recorded responses.
 *
 * @example
 * ```typescript
 * const client = new ReplayClient({
 *   responses: [
 *     { response: textResponse('Hello!') },
 *     { response: toolCallResponse([{ id: '1', name: 'search', arguments: { q: 'test' } }]) },
 *   ]
 * });
 *
 * const result1 = await client.ask('Hi');  // Returns 'Hello!'
 * const result2 = await client.ask('Search for something');  // Returns tool call
 * ```
 */
export class ReplayClient implements ChatClient {
  private responses: RecordedResponse[];
  private currentIndex = 0;
  private config: ReplayClientConfig;
  private callHistory: Array<{ input: string | AskInput; timestamp: Date }> = [];

  constructor(config: ReplayClientConfig = {}) {
    this.config = {
      model: 'replay-model',
      provider: 'replay',
      throwOnExhausted: true,
      ...config,
    };
    this.responses = config.responses ?? [];
  }

  /**
   * Add a response to the queue.
   */
  addResponse(response: AskResult | SimpleResponse): this {
    const askResult = 'type' in response ? response : createAskResult(response);
    this.responses.push({ response: askResult });
    return this;
  }

  /**
   * Add a response that matches a specific input pattern.
   */
  addPatternResponse(pattern: string | RegExp, response: AskResult | SimpleResponse): this {
    const askResult = 'type' in response ? response : createAskResult(response);
    this.responses.push({ inputPattern: pattern, response: askResult });
    return this;
  }

  /**
   * Get the history of all calls made to this client.
   */
  getCallHistory(): Array<{ input: string | AskInput; timestamp: Date }> {
    return [...this.callHistory];
  }

  /**
   * Reset the client state (index and history).
   */
  reset(): void {
    this.currentIndex = 0;
    this.callHistory = [];
  }

  /**
   * Clear all responses.
   */
  clearResponses(): void {
    this.responses = [];
    this.currentIndex = 0;
  }

  async ask(
    input: string | AskInput,
    options?: AskOptions & StreamingCallbacks
  ): Promise<AskResult> {
    this.callHistory.push({ input, timestamp: new Date() });

    const inputStr = typeof input === 'string' ? input : input.content ?? '';

    // First, try to find a pattern match
    for (const recorded of this.responses) {
      if (recorded.inputPattern) {
        const pattern = recorded.inputPattern;
        const matches =
          typeof pattern === 'string'
            ? inputStr.includes(pattern)
            : pattern.test(inputStr);
        if (matches) {
          return this.processResponse(recorded.response, options);
        }
      }
    }

    // Fall back to sequential responses (without patterns)
    const sequentialResponses = this.responses.filter(r => !r.inputPattern);
    if (this.currentIndex < sequentialResponses.length) {
      const response = sequentialResponses[this.currentIndex].response;
      this.currentIndex++;
      return this.processResponse(response, options);
    }

    // No response available
    if (this.config.throwOnExhausted) {
      throw new Error(
        `ReplayClient: No more responses available. ` +
        `Called ${this.callHistory.length} times, had ${sequentialResponses.length} sequential responses. ` +
        `Last input: "${inputStr.slice(0, 100)}..."`
      );
    }

    if (this.config.defaultResponse) {
      return this.processResponse(this.config.defaultResponse, options);
    }

    return errorResponse('No response available');
  }

  private processResponse(
    response: AskResult,
    options?: AskOptions & StreamingCallbacks
  ): AskResult {
    // Simulate streaming if callbacks provided
    if (response.type === 'success' && response.message.content) {
      if (options?.onChunk) {
        // Simulate chunked delivery
        options.onChunk(response.message.content);
      }
    }

    // Add to context if provided
    if (options?.context && response.type === 'success') {
      options.context.addMessage({
        role: 'user',
        content: typeof options === 'string' ? options : undefined,
        timestamp: new Date(),
      });
      options.context.addMessage(response.message);
    }

    return response;
  }

  getModel(): string {
    return this.config.model!;
  }

  getProvider(): string {
    return this.config.provider!;
  }
}

/**
 * Builder for creating ReplayClient with fluent API.
 *
 * @example
 * ```typescript
 * const client = replayClient()
 *   .respond('Hello!')
 *   .respond({ toolCalls: [{ id: '1', name: 'search', arguments: {} }] })
 *   .onPattern(/search/i, 'Search results...')
 *   .build();
 * ```
 */
export function replayClient(config?: Omit<ReplayClientConfig, 'responses'>) {
  const responses: RecordedResponse[] = [];

  const builder = {
    /**
     * Add a text response.
     */
    respond(content: string): typeof builder {
      responses.push({ response: textResponse(content) });
      return builder;
    },

    /**
     * Add a full AskResult response.
     */
    respondWith(response: AskResult): typeof builder {
      responses.push({ response });
      return builder;
    },

    /**
     * Add a tool call response.
     */
    respondWithToolCall(toolCalls: ToolCall[]): typeof builder {
      responses.push({ response: toolCallResponse(toolCalls) });
      return builder;
    },

    /**
     * Add a response for a specific pattern.
     */
    onPattern(pattern: string | RegExp, content: string): typeof builder {
      responses.push({ inputPattern: pattern, response: textResponse(content) });
      return builder;
    },

    /**
     * Build the ReplayClient.
     */
    build(): ReplayClient {
      return new ReplayClient({ ...config, responses });
    },
  };

  return builder;
}
