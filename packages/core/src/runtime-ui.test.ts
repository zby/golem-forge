/**
 * Tests for Runtime UI
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createUIEventBus } from './ui-event-bus.js';
import { createRuntimeUI } from './runtime-ui.js';
import type { UIEventBus } from './ui-event-bus.js';
import type { RuntimeUI } from './runtime-ui.js';

describe('RuntimeUI', () => {
  let bus: UIEventBus;
  let ui: RuntimeUI;

  beforeEach(() => {
    bus = createUIEventBus();
    ui = createRuntimeUI(bus);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('display methods', () => {
    describe('showMessage', () => {
      it('should emit message event', () => {
        const handler = vi.fn();
        bus.on('message', handler);

        ui.showMessage({ role: 'assistant', content: 'Hello!' });

        expect(handler).toHaveBeenCalledWith({
          message: { role: 'assistant', content: 'Hello!' },
        });
      });
    });

    describe('showStatus', () => {
      it('should emit status event', () => {
        const handler = vi.fn();
        bus.on('status', handler);

        ui.showStatus('warning', 'Something happened');

        expect(handler).toHaveBeenCalledWith({
          type: 'warning',
          message: 'Something happened',
        });
      });
    });

    describe('streaming', () => {
      it('should emit streaming events', () => {
        const handler = vi.fn();
        bus.on('streaming', handler);

        ui.startStreaming('req-1');
        expect(handler).toHaveBeenCalledWith({
          requestId: 'req-1',
          delta: '',
          done: false,
        });

        handler.mockClear();
        ui.appendStreaming('req-1', 'Hello');
        expect(handler).toHaveBeenCalledWith({
          requestId: 'req-1',
          delta: 'Hello',
          done: false,
        });

        handler.mockClear();
        ui.endStreaming('req-1');
        expect(handler).toHaveBeenCalledWith({
          requestId: 'req-1',
          delta: '',
          done: true,
        });
      });
    });

    describe('showToolStarted', () => {
      it('should emit toolStarted event', () => {
        const handler = vi.fn();
        bus.on('toolStarted', handler);

        ui.showToolStarted('call-1', 'read_file', { path: '/test.ts' }, 'worker-1');

        expect(handler).toHaveBeenCalledWith({
          toolCallId: 'call-1',
          toolName: 'read_file',
          args: { path: '/test.ts' },
          workerId: 'worker-1',
        });
      });
    });

    describe('showToolResult', () => {
      it('should emit toolResult event with value', () => {
        const handler = vi.fn();
        bus.on('toolResult', handler);

        ui.showToolResult(
          'call-1',
          'read_file',
          { path: '/test.ts' },
          'success',
          100,
          { kind: 'text', content: 'File contents' }
        );

        expect(handler).toHaveBeenCalledWith({
          toolCallId: 'call-1',
          toolName: 'read_file',
          args: { path: '/test.ts' },
          status: 'success',
          durationMs: 100,
          value: { kind: 'text', content: 'File contents' },
          error: undefined,
        });
      });

      it('should emit toolResult event with error', () => {
        const handler = vi.fn();
        bus.on('toolResult', handler);

        ui.showToolResult('call-1', 'failing_tool', {}, 'error', 50, undefined, 'Failed');

        expect(handler).toHaveBeenCalledWith({
          toolCallId: 'call-1',
          toolName: 'failing_tool',
          args: {},
          status: 'error',
          durationMs: 50,
          value: undefined,
          error: 'Failed',
        });
      });
    });

    describe('updateWorker', () => {
      it('should emit workerUpdate event', () => {
        const handler = vi.fn();
        bus.on('workerUpdate', handler);

        ui.updateWorker('w1', 'Process files', 'running', 'parent', 1);

        expect(handler).toHaveBeenCalledWith({
          workerId: 'w1',
          task: 'Process files',
          status: 'running',
          parentId: 'parent',
          depth: 1,
        });
      });

      it('should default depth to 0', () => {
        const handler = vi.fn();
        bus.on('workerUpdate', handler);

        ui.updateWorker('w1', 'Task', 'pending');

        expect(handler).toHaveBeenCalledWith(
          expect.objectContaining({ depth: 0 })
        );
      });
    });

    describe('showManualTools', () => {
      it('should emit manualToolsAvailable event', () => {
        const handler = vi.fn();
        bus.on('manualToolsAvailable', handler);

        ui.showManualTools([
          {
            name: 'test_tool',
            label: 'Test Tool',
            description: 'A test tool',
            fields: [],
          },
        ]);

        expect(handler).toHaveBeenCalledWith({
          tools: [
            {
              name: 'test_tool',
              label: 'Test Tool',
              description: 'A test tool',
              fields: [],
            },
          ],
        });
      });
    });

    describe('showDiffSummary', () => {
      it('should emit diffSummary event', () => {
        const handler = vi.fn();
        bus.on('diffSummary', handler);

        ui.showDiffSummary('diff-1', [
          { path: '/src/index.ts', operation: 'update', additions: 10, deletions: 5 },
        ]);

        expect(handler).toHaveBeenCalledWith({
          requestId: 'diff-1',
          summaries: [
            { path: '/src/index.ts', operation: 'update', additions: 10, deletions: 5 },
          ],
        });
      });
    });

    describe('showDiffContent', () => {
      it('should emit diffContent event', () => {
        const handler = vi.fn();
        bus.on('diffContent', handler);

        ui.showDiffContent('diff-1', '/test.ts', 'old', 'new', false);

        expect(handler).toHaveBeenCalledWith({
          requestId: 'diff-1',
          path: '/test.ts',
          original: 'old',
          modified: 'new',
          isNew: false,
        });
      });
    });

    describe('endSession', () => {
      it('should emit sessionEnd event', () => {
        const handler = vi.fn();
        bus.on('sessionEnd', handler);

        ui.endSession('completed', 'All done');

        expect(handler).toHaveBeenCalledWith({
          reason: 'completed',
          message: 'All done',
        });
      });
    });
  });

  describe('blocking methods', () => {
    describe('requestApproval', () => {
      it('should emit approvalRequired and resolve on response', async () => {
        const handler = vi.fn();
        bus.on('approvalRequired', handler);

        const promise = ui.requestApproval(
          'tool_call',
          'Execute command',
          { command: 'npm test' },
          'medium',
          [{ id: 'w1', depth: 0, task: 'Test' }]
        );

        // Verify event was emitted
        expect(handler).toHaveBeenCalledTimes(1);
        const emittedEvent = handler.mock.calls[0][0];
        expect(emittedEvent.type).toBe('tool_call');
        expect(emittedEvent.description).toBe('Execute command');

        // Simulate user approval
        bus.emit('approvalResponse', {
          requestId: emittedEvent.requestId,
          approved: true,
        });

        const result = await promise;
        expect(result).toEqual({ approved: true });
      });

      it('should handle session approval', async () => {
        const handler = vi.fn();
        bus.on('approvalRequired', handler);

        const promise = ui.requestApproval(
          'file_write',
          'Write file',
          {},
          'low',
          []
        );

        const requestId = handler.mock.calls[0][0].requestId;
        bus.emit('approvalResponse', { requestId, approved: 'session' });

        const result = await promise;
        expect(result).toEqual({ approved: 'session' });
      });

      it('should handle denial with reason', async () => {
        const handler = vi.fn();
        bus.on('approvalRequired', handler);

        const promise = ui.requestApproval(
          'command',
          'Run command',
          {},
          'high',
          []
        );

        const requestId = handler.mock.calls[0][0].requestId;
        bus.emit('approvalResponse', {
          requestId,
          approved: false,
          reason: 'Too risky',
        });

        const result = await promise;
        expect(result).toEqual({ approved: false, reason: 'Too risky' });
      });

      it('should timeout after specified duration', async () => {
        const promise = ui.requestApproval(
          'tool_call',
          'Test',
          {},
          'low',
          [],
          { timeoutMs: 1000 }
        );

        vi.advanceTimersByTime(1001);

        await expect(promise).rejects.toThrow('Approval request timed out');
      });

      it('should reject on abort signal', async () => {
        const controller = new AbortController();

        const promise = ui.requestApproval(
          'tool_call',
          'Test',
          {},
          'low',
          [],
          { signal: controller.signal }
        );

        controller.abort();

        await expect(promise).rejects.toThrow('Approval request aborted');
      });

      it('should ignore responses for other requests', async () => {
        const handler = vi.fn();
        bus.on('approvalRequired', handler);

        const promise = ui.requestApproval(
          'tool_call',
          'Test',
          {},
          'low',
          [],
          { timeoutMs: 500 }
        );

        // Send response for different request
        bus.emit('approvalResponse', {
          requestId: 'wrong-id',
          approved: true,
        });

        // Should still timeout
        vi.advanceTimersByTime(501);
        await expect(promise).rejects.toThrow('timed out');
      });
    });

    describe('getUserInput', () => {
      it('should emit inputPrompt and resolve on response', async () => {
        const handler = vi.fn();
        bus.on('inputPrompt', handler);

        const promise = ui.getUserInput('Enter value:');

        expect(handler).toHaveBeenCalledTimes(1);
        const emittedEvent = handler.mock.calls[0][0];
        expect(emittedEvent.prompt).toBe('Enter value:');

        bus.emit('userInput', {
          requestId: emittedEvent.requestId,
          content: 'user input',
        });

        const result = await promise;
        expect(result).toBe('user input');
      });

      it('should use default prompt', async () => {
        const handler = vi.fn();
        bus.on('inputPrompt', handler);

        ui.getUserInput();

        expect(handler.mock.calls[0][0].prompt).toBe('> ');
      });

      it('should timeout after specified duration', async () => {
        const promise = ui.getUserInput('Test', { timeoutMs: 1000 });

        vi.advanceTimersByTime(1001);

        await expect(promise).rejects.toThrow('User input request timed out');
      });

      it('should reject on abort signal', async () => {
        const controller = new AbortController();

        const promise = ui.getUserInput('Test', { signal: controller.signal });

        controller.abort();

        await expect(promise).rejects.toThrow('User input request aborted');
      });
    });
  });

  describe('subscription helpers', () => {
    describe('onInterrupt', () => {
      it('should subscribe to interrupt events', () => {
        const handler = vi.fn();
        ui.onInterrupt(handler);

        bus.emit('interrupt', { reason: 'User cancelled' });

        expect(handler).toHaveBeenCalledWith('User cancelled');
      });

      it('should return unsubscribe function', () => {
        const handler = vi.fn();
        const unsubscribe = ui.onInterrupt(handler);

        unsubscribe();
        bus.emit('interrupt', {});

        expect(handler).not.toHaveBeenCalled();
      });
    });

    describe('onManualToolInvoke', () => {
      it('should subscribe to manualToolInvoke events', () => {
        const handler = vi.fn();
        ui.onManualToolInvoke(handler);

        bus.emit('manualToolInvoke', {
          toolName: 'my_tool',
          args: { key: 'value' },
        });

        expect(handler).toHaveBeenCalledWith('my_tool', { key: 'value' });
      });
    });

    describe('onGetDiff', () => {
      it('should subscribe to getDiff events', () => {
        const handler = vi.fn();
        ui.onGetDiff(handler);

        bus.emit('getDiff', { requestId: 'req-1', path: '/file.ts' });

        expect(handler).toHaveBeenCalledWith('req-1', '/file.ts');
      });
    });
  });

  describe('bus property', () => {
    it('should expose the underlying event bus', () => {
      expect(ui.bus).toBe(bus);
    });
  });
});
