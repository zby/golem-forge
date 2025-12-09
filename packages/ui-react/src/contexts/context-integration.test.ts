/**
 * Integration tests for React contexts via event bus
 *
 * These tests verify that the contexts correctly interact with the event bus.
 * They test the subscription and emission logic without requiring React rendering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUIEventBus, type UIEventBus } from '@golem-forge/core';

describe('Context Integration', () => {
  let bus: UIEventBus;

  beforeEach(() => {
    bus = createUIEventBus();
  });

  describe('ApprovalContext semantics', () => {
    it('should emit session approval with correct discriminator', () => {
      const handler = vi.fn();
      bus.on('approvalResponse', handler);

      // Simulate what ApprovalContext.respond does
      bus.emit('approvalResponse', {
        requestId: 'req-1',
        approved: 'session',
      });

      expect(handler).toHaveBeenCalledWith({
        requestId: 'req-1',
        approved: 'session',
      });
    });

    it('should emit always approval with correct discriminator', () => {
      const handler = vi.fn();
      bus.on('approvalResponse', handler);

      bus.emit('approvalResponse', {
        requestId: 'req-1',
        approved: 'always',
      });

      expect(handler).toHaveBeenCalledWith({
        requestId: 'req-1',
        approved: 'always',
      });
    });

    it('should emit denial with reason', () => {
      const handler = vi.fn();
      bus.on('approvalResponse', handler);

      bus.emit('approvalResponse', {
        requestId: 'req-1',
        approved: false,
        reason: 'User denied',
      });

      expect(handler).toHaveBeenCalledWith({
        requestId: 'req-1',
        approved: false,
        reason: 'User denied',
      });
    });

    it('should emit simple true approval', () => {
      const handler = vi.fn();
      bus.on('approvalResponse', handler);

      bus.emit('approvalResponse', {
        requestId: 'req-1',
        approved: true,
      });

      expect(handler).toHaveBeenCalledWith({
        requestId: 'req-1',
        approved: true,
      });
    });
  });

  describe('ManualToolsContext behavior', () => {
    it('should receive manualToolsAvailable event', () => {
      const handler = vi.fn();
      bus.on('manualToolsAvailable', handler);

      bus.emit('manualToolsAvailable', {
        tools: [
          {
            name: 'submit',
            label: 'Submit',
            description: 'Submit the changes',
            fields: [],
          },
          {
            name: 'retry',
            label: 'Retry',
            description: 'Retry the operation',
            fields: [],
          },
        ],
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: 'submit' }),
          expect.objectContaining({ name: 'retry' }),
        ]),
      });
    });

    it('should emit manualToolInvoke event with tool name and args', () => {
      const handler = vi.fn();
      bus.on('manualToolInvoke', handler);

      // Simulate what ManualToolsContext.invoke does
      bus.emit('manualToolInvoke', {
        toolName: 'submit',
        args: { message: 'Done!' },
      });

      expect(handler).toHaveBeenCalledWith({
        toolName: 'submit',
        args: { message: 'Done!' },
      });
    });

    it('should emit manualToolInvoke with empty args', () => {
      const handler = vi.fn();
      bus.on('manualToolInvoke', handler);

      bus.emit('manualToolInvoke', {
        toolName: 'retry',
        args: {},
      });

      expect(handler).toHaveBeenCalledWith({
        toolName: 'retry',
        args: {},
      });
    });

    it('should handle sessionEnd clearing tools', () => {
      const toolsHandler = vi.fn();
      const sessionHandler = vi.fn();

      bus.on('manualToolsAvailable', toolsHandler);
      bus.on('sessionEnd', sessionHandler);

      // First, tools become available
      bus.emit('manualToolsAvailable', {
        tools: [{ name: 'submit', label: 'Submit', description: '', fields: [] }],
      });

      expect(toolsHandler).toHaveBeenCalledTimes(1);

      // Then session ends (context should clear tools)
      bus.emit('sessionEnd', { reason: 'completed' });

      expect(sessionHandler).toHaveBeenCalledWith({ reason: 'completed' });
    });
  });

  describe('InputPrompt flow', () => {
    it('should emit inputPrompt and receive userInput response', () => {
      const inputHandler = vi.fn();
      bus.on('userInput', inputHandler);

      // Runtime emits inputPrompt
      bus.emit('inputPrompt', {
        requestId: 'input-1',
        prompt: 'Enter your name:',
      });

      // UI responds with userInput
      bus.emit('userInput', {
        requestId: 'input-1',
        content: 'Alice',
      });

      expect(inputHandler).toHaveBeenCalledWith({
        requestId: 'input-1',
        content: 'Alice',
      });
    });

    it('should correlate inputPrompt with userInput by requestId', () => {
      const inputHandler = vi.fn();
      bus.on('userInput', inputHandler);

      // Multiple prompts
      bus.emit('inputPrompt', { requestId: 'input-1', prompt: 'Name:' });
      bus.emit('inputPrompt', { requestId: 'input-2', prompt: 'Age:' });

      // Responses in different order
      bus.emit('userInput', { requestId: 'input-2', content: '25' });
      bus.emit('userInput', { requestId: 'input-1', content: 'Bob' });

      expect(inputHandler).toHaveBeenCalledTimes(2);
      expect(inputHandler).toHaveBeenCalledWith({ requestId: 'input-2', content: '25' });
      expect(inputHandler).toHaveBeenCalledWith({ requestId: 'input-1', content: 'Bob' });
    });
  });
});
