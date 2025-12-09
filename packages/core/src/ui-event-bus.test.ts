/**
 * Tests for UI Event Bus
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createUIEventBus } from './ui-event-bus.js';
import type { UIEventBus } from './ui-event-bus.js';

describe('UIEventBus', () => {
  let bus: UIEventBus;

  beforeEach(() => {
    bus = createUIEventBus();
  });

  describe('emit and on', () => {
    it('should deliver display events to subscribers', () => {
      const handler = vi.fn();
      bus.on('message', handler);

      bus.emit('message', {
        message: { role: 'assistant', content: 'Hello' },
      });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        message: { role: 'assistant', content: 'Hello' },
      });
    });

    it('should deliver action events to subscribers', () => {
      const handler = vi.fn();
      bus.on('userInput', handler);

      bus.emit('userInput', { requestId: 'req-1', content: 'Hi there' });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        requestId: 'req-1',
        content: 'Hi there',
      });
    });

    it('should support multiple handlers for same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.on('status', handler1);
      bus.on('status', handler2);

      bus.emit('status', { type: 'info', message: 'Processing...' });

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should not call handlers for other events', () => {
      const messageHandler = vi.fn();
      const statusHandler = vi.fn();

      bus.on('message', messageHandler);
      bus.on('status', statusHandler);

      bus.emit('status', { type: 'warning', message: 'Warning!' });

      expect(messageHandler).not.toHaveBeenCalled();
      expect(statusHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('unsubscribe', () => {
    it('should stop receiving events after unsubscribe', () => {
      const handler = vi.fn();
      const unsubscribe = bus.on('message', handler);

      bus.emit('message', {
        message: { role: 'user', content: 'First' },
      });
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();

      bus.emit('message', {
        message: { role: 'user', content: 'Second' },
      });
      expect(handler).toHaveBeenCalledTimes(1); // Still 1, not 2
    });

    it('should only unsubscribe the specific handler', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unsubscribe1 = bus.on('message', handler1);
      bus.on('message', handler2);

      unsubscribe1();

      bus.emit('message', {
        message: { role: 'assistant', content: 'Test' },
      });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('off', () => {
    it('should remove all handlers for an event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      bus.on('status', handler1);
      bus.on('status', handler2);

      bus.off('status');

      bus.emit('status', { type: 'error', message: 'Error!' });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should not affect handlers for other events', () => {
      const messageHandler = vi.fn();
      const statusHandler = vi.fn();

      bus.on('message', messageHandler);
      bus.on('status', statusHandler);

      bus.off('status');

      bus.emit('message', {
        message: { role: 'system', content: 'System message' },
      });

      expect(messageHandler).toHaveBeenCalledTimes(1);
    });
  });

  describe('clear', () => {
    it('should remove all handlers for all events', () => {
      const messageHandler = vi.fn();
      const statusHandler = vi.fn();
      const interruptHandler = vi.fn();

      bus.on('message', messageHandler);
      bus.on('status', statusHandler);
      bus.on('interrupt', interruptHandler);

      bus.clear();

      bus.emit('message', { message: { role: 'user', content: 'Test' } });
      bus.emit('status', { type: 'info', message: 'Info' });
      bus.emit('interrupt', {});

      expect(messageHandler).not.toHaveBeenCalled();
      expect(statusHandler).not.toHaveBeenCalled();
      expect(interruptHandler).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should catch errors in handlers and continue to other handlers', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      const throwingHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const normalHandler = vi.fn();

      bus.on('message', throwingHandler);
      bus.on('message', normalHandler);

      bus.emit('message', {
        message: { role: 'assistant', content: 'Test' },
      });

      expect(throwingHandler).toHaveBeenCalledTimes(1);
      expect(normalHandler).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe('type safety', () => {
    it('should handle all display event types', () => {
      const handlers = {
        message: vi.fn(),
        streaming: vi.fn(),
        status: vi.fn(),
        toolStarted: vi.fn(),
        toolResult: vi.fn(),
        workerUpdate: vi.fn(),
        approvalRequired: vi.fn(),
        manualToolsAvailable: vi.fn(),
        diffSummary: vi.fn(),
        diffContent: vi.fn(),
        inputPrompt: vi.fn(),
        sessionEnd: vi.fn(),
      };

      bus.on('message', handlers.message);
      bus.on('streaming', handlers.streaming);
      bus.on('status', handlers.status);
      bus.on('toolStarted', handlers.toolStarted);
      bus.on('toolResult', handlers.toolResult);
      bus.on('workerUpdate', handlers.workerUpdate);
      bus.on('approvalRequired', handlers.approvalRequired);
      bus.on('manualToolsAvailable', handlers.manualToolsAvailable);
      bus.on('diffSummary', handlers.diffSummary);
      bus.on('diffContent', handlers.diffContent);
      bus.on('inputPrompt', handlers.inputPrompt);
      bus.on('sessionEnd', handlers.sessionEnd);

      // Emit each event type
      bus.emit('message', { message: { role: 'user', content: 'Hi' } });
      bus.emit('streaming', { requestId: 'r1', delta: 'text', done: false });
      bus.emit('status', { type: 'info', message: 'Info' });
      bus.emit('toolStarted', { toolCallId: 't1', toolName: 'test', args: {} });
      bus.emit('toolResult', {
        toolCallId: 't1',
        toolName: 'test',
        status: 'success',
        durationMs: 100,
      });
      bus.emit('workerUpdate', {
        workerId: 'w1',
        task: 'Test task',
        status: 'running',
        depth: 0,
      });
      bus.emit('approvalRequired', {
        requestId: 'a1',
        type: 'tool_call',
        description: 'Test',
        details: {},
        risk: 'low',
        workerPath: [],
      });
      bus.emit('manualToolsAvailable', { tools: [] });
      bus.emit('diffSummary', { requestId: 'd1', summaries: [] });
      bus.emit('diffContent', {
        requestId: 'd1',
        path: '/test',
        modified: 'content',
        isNew: true,
      });
      bus.emit('inputPrompt', { requestId: 'i1', prompt: '> ' });
      bus.emit('sessionEnd', { reason: 'completed' });

      // Verify all handlers were called
      Object.values(handlers).forEach((handler) => {
        expect(handler).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle all action event types', () => {
      const handlers = {
        userInput: vi.fn(),
        approvalResponse: vi.fn(),
        manualToolInvoke: vi.fn(),
        interrupt: vi.fn(),
        getDiff: vi.fn(),
      };

      bus.on('userInput', handlers.userInput);
      bus.on('approvalResponse', handlers.approvalResponse);
      bus.on('manualToolInvoke', handlers.manualToolInvoke);
      bus.on('interrupt', handlers.interrupt);
      bus.on('getDiff', handlers.getDiff);

      // Emit each action event type
      bus.emit('userInput', { requestId: 'i1', content: 'Hello' });
      bus.emit('approvalResponse', { requestId: 'a1', approved: true });
      bus.emit('manualToolInvoke', { toolName: 'test', args: {} });
      bus.emit('interrupt', {});
      bus.emit('getDiff', { requestId: 'd1', path: '/file.ts' });

      // Verify all handlers were called
      Object.values(handlers).forEach((handler) => {
        expect(handler).toHaveBeenCalledTimes(1);
      });
    });
  });
});
