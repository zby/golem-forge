/**
 * Worker Runtime Integration Tests
 *
 * Tests worker execution with LLM interactions.
 * - Default: Uses replay client with pre-recorded responses
 * - With RUN_LIVE_TESTS=1: Uses live Anthropic API
 */

import { describe, it, expect } from 'vitest';
import { Context, defineTool, toToolResults } from '@mariozechner/lemmy';
import { z } from 'zod';
import {
  textResponse,
  toolCallResponse,
  getTestClient,
  skipIfNotLive,
  skipIfLive,
} from '../testing/index.js';

describe('LLM Integration', () => {
  describe('simple conversation (replay)', () => {
    it('handles basic ask/response', async () => {
      const client = getTestClient({
        replayResponses: [
          { response: textResponse('Hello! How can I help you today?') },
        ],
      });

      const context = new Context();
      const result = await client.ask('Hello', { context });

      expect(result.type).toBe('success');
      if (result.type === 'success') {
        expect(result.message.content).toContain('Hello');
      }
    });

    it('handles multi-turn conversation', async () => {
      const client = getTestClient({
        replayResponses: [
          { response: textResponse('Hi there!') },
          { response: textResponse('I can help with many things.') },
          { response: textResponse('Goodbye!') },
        ],
      });

      const context = new Context();

      const r1 = await client.ask('Hello', { context });
      const r2 = await client.ask('What can you do?', { context });
      const r3 = await client.ask('Bye', { context });

      expect(r1.type).toBe('success');
      expect(r2.type).toBe('success');
      expect(r3.type).toBe('success');

      // Context should have all messages
      expect(context.getMessages().length).toBe(6); // 3 user + 3 assistant
    });
  });

  describe('tool usage (replay)', () => {
    it('handles tool call and response cycle', async () => {
      const client = getTestClient({
        replayResponses: [
          {
            response: toolCallResponse([
              { id: 'call_1', name: 'calculator', arguments: { a: 5, b: 3, op: 'add' } },
            ]),
          },
          { response: textResponse('The result of 5 + 3 is 8.') },
        ],
      });

      const context = new Context();

      // Add calculator tool
      const calculatorTool = defineTool({
        name: 'calculator',
        description: 'Perform arithmetic',
        schema: z.object({
          a: z.number(),
          b: z.number(),
          op: z.enum(['add', 'subtract', 'multiply', 'divide']),
        }),
        execute: async ({ a, b, op }) => {
          switch (op) {
            case 'add': return a + b;
            case 'subtract': return a - b;
            case 'multiply': return a * b;
            case 'divide': return a / b;
          }
        },
      });
      context.addTool(calculatorTool);

      // First call - get tool call
      const result1 = await client.ask('What is 5 + 3?', { context });

      expect(result1.type).toBe('success');
      if (result1.type === 'success') {
        expect(result1.message.toolCalls).toHaveLength(1);
        expect(result1.message.toolCalls![0].name).toBe('calculator');

        // Execute tool
        const toolResults = await context.executeTools(result1.message.toolCalls!);
        expect(toolResults[0].success).toBe(true);
        if (toolResults[0].success) {
          expect(toolResults[0].result).toBe(8);
        }

        // Send tool results back
        const result2 = await client.ask(
          { toolResults: toToolResults(toolResults) },
          { context }
        );

        expect(result2.type).toBe('success');
        if (result2.type === 'success') {
          expect(result2.message.content).toContain('8');
        }
      }
    });
  });

  describe.skipIf(skipIfNotLive)('live API tests', () => {
    it('executes simple conversation with live API', async () => {
      const client = getTestClient({
        replayResponses: [], // Not used in live mode
        liveModel: 'claude-3-5-haiku-20241022',
      });

      const context = new Context();
      context.setSystemMessage('You are a helpful assistant. Be concise.');

      const result = await client.ask('Say hello in exactly 3 words.', { context });

      expect(result.type).toBe('success');
      if (result.type === 'success') {
        expect(result.message.content).toBeDefined();
        console.log('Live response:', result.message.content);
      }
    }, 30000);

    it('handles tool calls with live API', async () => {
      const client = getTestClient({
        replayResponses: [],
        liveModel: 'claude-3-5-haiku-20241022',
      });

      const context = new Context();
      context.setSystemMessage('You are a calculator. Always use the calculator tool for math.');

      context.addTool(
        defineTool({
          name: 'calculator',
          description: 'Perform arithmetic operations',
          schema: z.object({
            operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
            a: z.number(),
            b: z.number(),
          }),
          execute: async ({ operation, a, b }) => {
            switch (operation) {
              case 'add': return a + b;
              case 'subtract': return a - b;
              case 'multiply': return a * b;
              case 'divide': return a / b;
            }
          },
        })
      );

      const result = await client.ask('What is 15 + 27?', { context });

      expect(result.type).toBe('success');
      if (result.type === 'success' && result.message.toolCalls?.length) {
        const toolResults = await context.executeTools(result.message.toolCalls);
        expect(toolResults[0].success).toBe(true);
        if (toolResults[0].success) {
          expect(toolResults[0].result).toBe(42);
        }
      }
    }, 30000);
  });

  describe.skipIf(skipIfLive)('replay-only tests', () => {
    it('verifies exact response matching', async () => {
      const client = getTestClient({
        replayResponses: [
          { response: textResponse('Exact expected response') },
        ],
      });

      const context = new Context();
      const result = await client.ask('test', { context });

      expect(result.type).toBe('success');
      if (result.type === 'success') {
        expect(result.message.content).toBe('Exact expected response');
      }
    });
  });
});
