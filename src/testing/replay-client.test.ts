import { describe, it, expect, beforeEach } from 'vitest';
import { Context } from '@mariozechner/lemmy';
import {
  ReplayClient,
  replayClient,
  textResponse,
  toolCallResponse,
  errorResponse,
} from './replay-client.js';

describe('ReplayClient', () => {
  describe('sequential responses', () => {
    it('returns responses in order', async () => {
      const client = new ReplayClient({
        responses: [
          { response: textResponse('First') },
          { response: textResponse('Second') },
          { response: textResponse('Third') },
        ],
      });

      const r1 = await client.ask('a');
      const r2 = await client.ask('b');
      const r3 = await client.ask('c');

      expect(r1.type).toBe('success');
      expect(r1.type === 'success' && r1.message.content).toBe('First');
      expect(r2.type === 'success' && r2.message.content).toBe('Second');
      expect(r3.type === 'success' && r3.message.content).toBe('Third');
    });

    it('throws when responses exhausted by default', async () => {
      const client = new ReplayClient({
        responses: [{ response: textResponse('Only one') }],
      });

      await client.ask('first');
      await expect(client.ask('second')).rejects.toThrow('No more responses');
    });

    it('returns default response when exhausted if configured', async () => {
      const client = new ReplayClient({
        responses: [{ response: textResponse('First') }],
        throwOnExhausted: false,
        defaultResponse: textResponse('Default'),
      });

      await client.ask('first');
      const r2 = await client.ask('second');

      expect(r2.type === 'success' && r2.message.content).toBe('Default');
    });
  });

  describe('pattern matching', () => {
    it('matches string patterns', async () => {
      const client = new ReplayClient({
        responses: [
          { inputPattern: 'hello', response: textResponse('Hi there!') },
          { inputPattern: 'bye', response: textResponse('Goodbye!') },
        ],
      });

      const r1 = await client.ask('say hello to me');
      const r2 = await client.ask('bye bye');

      expect(r1.type === 'success' && r1.message.content).toBe('Hi there!');
      expect(r2.type === 'success' && r2.message.content).toBe('Goodbye!');
    });

    it('matches regex patterns', async () => {
      const client = new ReplayClient({
        responses: [
          { inputPattern: /search.*(\w+)/i, response: textResponse('Found it!') },
        ],
      });

      const result = await client.ask('please Search for something');
      expect(result.type === 'success' && result.message.content).toBe('Found it!');
    });

    it('falls back to sequential when no pattern matches', async () => {
      const client = new ReplayClient({
        responses: [
          { inputPattern: 'special', response: textResponse('Special!') },
          { response: textResponse('Default 1') },
          { response: textResponse('Default 2') },
        ],
      });

      const r1 = await client.ask('normal request');
      const r2 = await client.ask('another normal');
      const r3 = await client.ask('special request');

      expect(r1.type === 'success' && r1.message.content).toBe('Default 1');
      expect(r2.type === 'success' && r2.message.content).toBe('Default 2');
      expect(r3.type === 'success' && r3.message.content).toBe('Special!');
    });
  });

  describe('tool calls', () => {
    it('returns tool call responses', async () => {
      const client = new ReplayClient({
        responses: [
          {
            response: toolCallResponse([
              { id: 'call_1', name: 'search', arguments: { query: 'test' } },
            ]),
          },
        ],
      });

      const result = await client.ask('search for test');

      expect(result.type).toBe('success');
      if (result.type === 'success') {
        expect(result.stopReason).toBe('tool_call');
        expect(result.message.toolCalls).toHaveLength(1);
        expect(result.message.toolCalls![0].name).toBe('search');
      }
    });
  });

  describe('error responses', () => {
    it('returns error responses', async () => {
      const client = new ReplayClient({
        responses: [
          { response: errorResponse('Rate limited', 'rate_limit') },
        ],
      });

      const result = await client.ask('anything');

      expect(result.type).toBe('error');
      if (result.type === 'error') {
        expect(result.error.type).toBe('rate_limit');
        expect(result.error.retryable).toBe(true);
      }
    });
  });

  describe('call history', () => {
    it('tracks all calls', async () => {
      const client = new ReplayClient({
        responses: [
          { response: textResponse('1') },
          { response: textResponse('2') },
        ],
      });

      await client.ask('first input');
      await client.ask('second input');

      const history = client.getCallHistory();
      expect(history).toHaveLength(2);
      expect(history[0].input).toBe('first input');
      expect(history[1].input).toBe('second input');
    });

    it('resets state correctly', async () => {
      const client = new ReplayClient({
        responses: [
          { response: textResponse('response') },
        ],
      });

      await client.ask('first');
      client.reset();

      // Should be able to get the same response again
      const result = await client.ask('second');
      expect(result.type === 'success' && result.message.content).toBe('response');
      expect(client.getCallHistory()).toHaveLength(1);
    });
  });

  describe('fluent builder', () => {
    it('builds client with fluent API', async () => {
      const client = replayClient()
        .respond('Hello!')
        .respond('How can I help?')
        .respondWithToolCall([{ id: '1', name: 'test', arguments: {} }])
        .build();

      const r1 = await client.ask('hi');
      const r2 = await client.ask('help');
      const r3 = await client.ask('do something');

      expect(r1.type === 'success' && r1.message.content).toBe('Hello!');
      expect(r2.type === 'success' && r2.message.content).toBe('How can I help?');
      expect(r3.type === 'success' && r3.message.toolCalls).toHaveLength(1);
    });

    it('supports pattern matching in builder', async () => {
      const client = replayClient()
        .onPattern(/weather/i, 'Sunny and warm!')
        .respond('Default response')
        .build();

      const r1 = await client.ask("What's the weather?");
      const r2 = await client.ask('Something else');

      expect(r1.type === 'success' && r1.message.content).toBe('Sunny and warm!');
      expect(r2.type === 'success' && r2.message.content).toBe('Default response');
    });
  });

  describe('addResponse', () => {
    it('adds responses dynamically', async () => {
      const client = new ReplayClient();

      client
        .addResponse({ content: 'First' })
        .addResponse(textResponse('Second'));

      const r1 = await client.ask('a');
      const r2 = await client.ask('b');

      expect(r1.type === 'success' && r1.message.content).toBe('First');
      expect(r2.type === 'success' && r2.message.content).toBe('Second');
    });
  });

  describe('metadata', () => {
    it('reports configured model and provider', () => {
      const client = new ReplayClient({
        model: 'test-model',
        provider: 'test-provider',
      });

      expect(client.getModel()).toBe('test-model');
      expect(client.getProvider()).toBe('test-provider');
    });

    it('uses defaults when not configured', () => {
      const client = new ReplayClient();

      expect(client.getModel()).toBe('replay-model');
      expect(client.getProvider()).toBe('replay');
    });
  });
});
