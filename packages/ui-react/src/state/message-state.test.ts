/**
 * Tests for Message State Management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createMessageState,
  addMessage,
  addDisplayMessage,
  addToolResult,
  addToolResultFromEvent,
  addStatus,
  addWorkerStart,
  addWorkerComplete,
  startStreaming,
  appendStreaming,
  updateStreamingFromEvent,
  commitStreaming,
  cancelStreaming,
  clearMessages,
  getConversationMessages,
  getLastMessageByRole,
  getRecentMessages,
  isAwaitingResponse,
  getCurrentDisplayContent,
  getMessageStats,
} from './message-state.js';
import type { MessageState, Message, StatusUpdate, ToolResultData } from './message-state.js';
import type { ToolResultValue } from '@golem-forge/core';

describe('Message State', () => {
  let state: MessageState;

  beforeEach(() => {
    state = createMessageState();
  });

  describe('createMessageState', () => {
    it('should create empty state', () => {
      expect(state.messages).toEqual([]);
      expect(state.streamingContent).toBeNull();
      expect(state.isStreaming).toBe(false);
      expect(state.streamingRequestId).toBeNull();
    });
  });

  describe('addMessage', () => {
    it('should add a message', () => {
      const message: Message = {
        role: 'user',
        content: 'Hello',
        timestamp: Date.now(),
      };

      state = addMessage(state, message);

      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]).toEqual({ type: 'message', message });
    });

    it('should add multiple messages in order', () => {
      state = addMessage(state, { role: 'user', content: 'Hi' });
      state = addMessage(state, { role: 'assistant', content: 'Hello!' });
      state = addMessage(state, { role: 'user', content: 'How are you?' });

      expect(state.messages).toHaveLength(3);
      expect(
        state.messages.map((m) => (m.type === 'message' ? m.message.role : null))
      ).toEqual(['user', 'assistant', 'user']);
    });
  });

  describe('addDisplayMessage', () => {
    it('should convert display message to message', () => {
      state = addDisplayMessage(state, {
        role: 'assistant',
        content: 'Test content',
        timestamp: 12345,
      });

      expect(state.messages).toHaveLength(1);
      const msg = state.messages[0];
      expect(msg.type).toBe('message');
      if (msg.type === 'message') {
        expect(msg.message.role).toBe('assistant');
        expect(msg.message.content).toBe('Test content');
        expect(msg.message.timestamp).toBe(12345);
      }
    });
  });

  describe('addToolResult', () => {
    it('should add a tool result', () => {
      const result: ToolResultData = {
        toolName: 'read_file',
        toolCallId: 'call-123',
        args: {},
        status: 'success',
        summary: 'Read file.txt',
        durationMs: 50,
      };

      state = addToolResult(state, result);

      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]).toEqual({ type: 'tool_result', result });
    });
  });

  describe('addToolResultFromEvent', () => {
    it('should create summary from text value', () => {
      state = addToolResultFromEvent(
        state,
        'call-1',
        'test_tool',
        {},
        'success',
        100,
        { kind: 'text', content: 'Short text' }
      );

      const msg = state.messages[0];
      expect(msg.type).toBe('tool_result');
      if (msg.type === 'tool_result') {
        expect(msg.result.summary).toBe('Short text');
      }
    });

    it('should truncate long text in summary', () => {
      const longText = 'x'.repeat(200);
      state = addToolResultFromEvent(
        state,
        'call-1',
        'test_tool',
        {},
        'success',
        100,
        { kind: 'text', content: longText }
      );

      const msg = state.messages[0];
      if (msg.type === 'tool_result') {
        expect(msg.result.summary!.length).toBeLessThan(200);
        expect(msg.result.summary!.endsWith('...')).toBe(true);
      }
    });

    it('should create summary from diff value', () => {
      state = addToolResultFromEvent(
        state,
        'call-1',
        'write_file',
        {},
        'success',
        100,
        { kind: 'diff', path: '/test.ts', modified: 'new', isNew: true, bytesWritten: 10 }
      );

      const msg = state.messages[0];
      if (msg.type === 'tool_result') {
        expect(msg.result.summary).toBe('Modified /test.ts');
      }
    });

    it('should create summary from file_content value', () => {
      state = addToolResultFromEvent(
        state,
        'call-1',
        'read_file',
        {},
        'success',
        50,
        { kind: 'file_content', path: '/data.json', content: '{}', size: 256 }
      );

      const msg = state.messages[0];
      if (msg.type === 'tool_result') {
        expect(msg.result.summary).toBe('Read /data.json (256 bytes)');
      }
    });

    it('should create summary from file_list value', () => {
      state = addToolResultFromEvent(
        state,
        'call-1',
        'list_dir',
        {},
        'success',
        30,
        { kind: 'file_list', path: '/src', files: ['a.ts', 'b.ts'], count: 2 }
      );

      const msg = state.messages[0];
      if (msg.type === 'tool_result') {
        expect(msg.result.summary).toBe('Listed 2 entries in /src');
      }
    });

    it('should use json summary if provided', () => {
      state = addToolResultFromEvent(
        state,
        'call-1',
        'api_call',
        {},
        'success',
        200,
        { kind: 'json', data: { key: 'value' }, summary: 'API response received' }
      );

      const msg = state.messages[0];
      if (msg.type === 'tool_result') {
        expect(msg.result.summary).toBe('API response received');
      }
    });

    it('should prefer value.summary over generated summary for diff', () => {
      state = addToolResultFromEvent(
        state,
        'call-1',
        'write_file',
        {},
        'success',
        100,
        {
          kind: 'diff',
          path: '/test.ts',
          modified: 'new content',
          isNew: true,
          bytesWritten: 11,
          summary: 'Created /test.ts (11 bytes)',
        }
      );

      const msg = state.messages[0];
      if (msg.type === 'tool_result') {
        expect(msg.result.summary).toBe('Created /test.ts (11 bytes)');
      }
    });

    it('should prefer value.summary over generated summary for file_content', () => {
      state = addToolResultFromEvent(
        state,
        'call-1',
        'read_file',
        {},
        'success',
        50,
        {
          kind: 'file_content',
          path: '/data.json',
          content: '{}',
          size: 256,
          summary: 'Custom summary from tool',
        }
      );

      const msg = state.messages[0];
      if (msg.type === 'tool_result') {
        expect(msg.result.summary).toBe('Custom summary from tool');
      }
    });

    it('should handle custom result types', () => {
      state = addToolResultFromEvent(
        state,
        'call-1',
        'git_status',
        {},
        'success',
        75,
        {
          kind: 'git.status' as 'json', // Cast to satisfy TS since it's a custom kind
          data: { branch: 'main', ahead: 2 },
          summary: 'On branch main, 2 commits ahead',
        } as ToolResultValue
      );

      const msg = state.messages[0];
      if (msg.type === 'tool_result') {
        expect(msg.result.summary).toBe('On branch main, 2 commits ahead');
      }
    });

    it('should generate summary for custom result types without summary field', () => {
      state = addToolResultFromEvent(
        state,
        'call-1',
        'custom_tool',
        {},
        'success',
        75,
        {
          kind: 'custom.result' as 'json', // Cast to satisfy TS since it's a custom kind
          data: { foo: 'bar' },
        } as ToolResultValue
      );

      const msg = state.messages[0];
      if (msg.type === 'tool_result') {
        expect(msg.result.summary).toBe('Custom result (custom.result)');
      }
    });

    it('should include error for error status', () => {
      state = addToolResultFromEvent(
        state,
        'call-1',
        'failing_tool',
        {},
        'error',
        50,
        undefined,
        'Something went wrong'
      );

      const msg = state.messages[0];
      if (msg.type === 'tool_result') {
        expect(msg.result.status).toBe('error');
        expect(msg.result.error).toBe('Something went wrong');
      }
    });

    it('should preserve the full ToolResultValue for text', () => {
      const value: ToolResultValue = {
        kind: 'text',
        content: 'Full text content that should be preserved',
      };

      state = addToolResultFromEvent(
        state,
        'call-1',
        'read_tool',
        {},
        'success',
        100,
        value
      );

      const msg = state.messages[0];
      if (msg.type === 'tool_result') {
        expect(msg.result.value).toBeDefined();
        expect(msg.result.value).toEqual(value);
        expect(msg.result.value?.kind).toBe('text');
      }
    });

    it('should preserve the full ToolResultValue for diff', () => {
      const value: ToolResultValue = {
        kind: 'diff',
        path: '/src/app.ts',
        original: 'const x = 1;',
        modified: 'const x = 2;',
        isNew: false,
        bytesWritten: 13,
      };

      state = addToolResultFromEvent(
        state,
        'call-1',
        'write_file',
        {},
        'success',
        150,
        value
      );

      const msg = state.messages[0];
      if (msg.type === 'tool_result') {
        expect(msg.result.value).toBeDefined();
        expect(msg.result.value?.kind).toBe('diff');
        if (msg.result.value?.kind === 'diff') {
          expect(msg.result.value.original).toBe('const x = 1;');
          expect(msg.result.value.modified).toBe('const x = 2;');
          expect(msg.result.value.path).toBe('/src/app.ts');
        }
      }
    });

    it('should preserve the full ToolResultValue for file_content', () => {
      const value: ToolResultValue = {
        kind: 'file_content',
        path: '/data/config.json',
        content: '{"key": "value", "nested": {"a": 1}}',
        size: 36,
      };

      state = addToolResultFromEvent(
        state,
        'call-1',
        'read_file',
        {},
        'success',
        50,
        value
      );

      const msg = state.messages[0];
      if (msg.type === 'tool_result') {
        expect(msg.result.value).toBeDefined();
        expect(msg.result.value?.kind).toBe('file_content');
        if (msg.result.value?.kind === 'file_content') {
          expect(msg.result.value.content).toBe('{"key": "value", "nested": {"a": 1}}');
          expect(msg.result.value.path).toBe('/data/config.json');
        }
      }
    });

    it('should preserve the full ToolResultValue for file_list', () => {
      const value: ToolResultValue = {
        kind: 'file_list',
        path: '/src',
        files: ['app.ts', 'index.ts', 'utils.ts', 'types.ts'],
        count: 4,
      };

      state = addToolResultFromEvent(
        state,
        'call-1',
        'list_dir',
        {},
        'success',
        30,
        value
      );

      const msg = state.messages[0];
      if (msg.type === 'tool_result') {
        expect(msg.result.value).toBeDefined();
        expect(msg.result.value?.kind).toBe('file_list');
        if (msg.result.value?.kind === 'file_list') {
          expect(msg.result.value.files).toHaveLength(4);
          expect(msg.result.value.files).toContain('app.ts');
        }
      }
    });

    it('should preserve the full ToolResultValue for json', () => {
      const value: ToolResultValue = {
        kind: 'json',
        data: { users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }] },
        summary: '2 users found',
      };

      state = addToolResultFromEvent(
        state,
        'call-1',
        'api_call',
        {},
        'success',
        200,
        value
      );

      const msg = state.messages[0];
      if (msg.type === 'tool_result') {
        expect(msg.result.value).toBeDefined();
        expect(msg.result.value?.kind).toBe('json');
        if (msg.result.value?.kind === 'json') {
          expect(msg.result.value.data).toEqual({
            users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
          });
        }
      }
    });

    it('should have both value and summary', () => {
      const value: ToolResultValue = {
        kind: 'text',
        content: 'Full content here',
        summary: 'Custom summary',
      };

      state = addToolResultFromEvent(
        state,
        'call-1',
        'test_tool',
        {},
        'success',
        100,
        value
      );

      const msg = state.messages[0];
      if (msg.type === 'tool_result') {
        // Both value and summary should be present
        expect(msg.result.value).toBeDefined();
        expect(msg.result.summary).toBe('Custom summary');
      }
    });
  });

  describe('addStatus', () => {
    it('should add a status update', () => {
      const status: StatusUpdate = { type: 'info', message: 'Processing...' };

      state = addStatus(state, status);

      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]).toEqual({ type: 'status', status });
    });
  });

  describe('addWorkerStart', () => {
    it('should add worker start event', () => {
      state = addWorkerStart(state, 'worker-1', 'Analyze code');

      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]).toEqual({
        type: 'worker_start',
        workerId: 'worker-1',
        task: 'Analyze code',
      });
    });
  });

  describe('addWorkerComplete', () => {
    it('should add worker complete event', () => {
      state = addWorkerComplete(state, 'worker-1', true);

      expect(state.messages).toHaveLength(1);
      expect(state.messages[0]).toEqual({
        type: 'worker_complete',
        workerId: 'worker-1',
        success: true,
      });
    });
  });

  describe('streaming', () => {
    describe('startStreaming', () => {
      it('should start streaming with empty content', () => {
        state = startStreaming(state, 'req-1');

        expect(state.isStreaming).toBe(true);
        expect(state.streamingContent).toBe('');
        expect(state.streamingRequestId).toBe('req-1');
      });

      it('should start streaming with initial content', () => {
        state = startStreaming(state, 'req-1', 'Hello');

        expect(state.streamingContent).toBe('Hello');
      });
    });

    describe('appendStreaming', () => {
      it('should append to streaming content', () => {
        state = startStreaming(state, 'req-1', 'Hello');
        state = appendStreaming(state, ' World');

        expect(state.streamingContent).toBe('Hello World');
      });

      it('should not append when not streaming', () => {
        state = appendStreaming(state, 'test');
        expect(state.streamingContent).toBeNull();
      });
    });

    describe('updateStreamingFromEvent', () => {
      it('should start streaming on first event', () => {
        state = updateStreamingFromEvent(state, 'req-1', 'Hello', false);

        expect(state.isStreaming).toBe(true);
        expect(state.streamingContent).toBe('Hello');
      });

      it('should append on subsequent events', () => {
        state = updateStreamingFromEvent(state, 'req-1', 'Hello', false);
        state = updateStreamingFromEvent(state, 'req-1', ' World', false);

        expect(state.streamingContent).toBe('Hello World');
      });

      it('should commit on done=true', () => {
        state = updateStreamingFromEvent(state, 'req-1', 'Hello', false);
        state = updateStreamingFromEvent(state, 'req-1', ' World', true);

        expect(state.isStreaming).toBe(false);
        expect(state.streamingContent).toBeNull();
        expect(state.messages).toHaveLength(1);
        const msg = state.messages[0];
        if (msg.type === 'message') {
          expect(msg.message.content).toBe('Hello World');
        }
      });
    });

    describe('commitStreaming', () => {
      it('should commit streaming content as message', () => {
        state = startStreaming(state, 'req-1', 'Streamed content');
        state = commitStreaming(state);

        expect(state.isStreaming).toBe(false);
        expect(state.streamingContent).toBeNull();
        expect(state.messages).toHaveLength(1);

        const msg = state.messages[0];
        expect(msg.type).toBe('message');
        if (msg.type === 'message') {
          expect(msg.message.role).toBe('assistant');
          expect(msg.message.content).toBe('Streamed content');
        }
      });

      it('should not add message if no content', () => {
        state = commitStreaming(state);
        expect(state.messages).toHaveLength(0);
      });
    });

    describe('cancelStreaming', () => {
      it('should cancel without committing', () => {
        state = startStreaming(state, 'req-1', 'Partial content');
        state = cancelStreaming(state);

        expect(state.isStreaming).toBe(false);
        expect(state.streamingContent).toBeNull();
        expect(state.messages).toHaveLength(0);
      });
    });
  });

  describe('clearMessages', () => {
    it('should reset state', () => {
      state = addMessage(state, { role: 'user', content: 'Hi' });
      state = addMessage(state, { role: 'assistant', content: 'Hello' });
      state = startStreaming(state, 'req-1', 'Streaming...');

      state = clearMessages();

      expect(state.messages).toHaveLength(0);
      expect(state.isStreaming).toBe(false);
      expect(state.streamingContent).toBeNull();
    });
  });

  describe('getConversationMessages', () => {
    it('should return only message entries', () => {
      state = addMessage(state, { role: 'user', content: 'Hi' });
      state = addStatus(state, { type: 'info', message: 'Processing' });
      state = addMessage(state, { role: 'assistant', content: 'Hello' });
      state = addToolResult(state, {
        toolName: 'test',
        toolCallId: '1',
        args: {},
        status: 'success',
        durationMs: 10,
      });

      const messages = getConversationMessages(state);

      expect(messages).toHaveLength(2);
      expect(messages[0].content).toBe('Hi');
      expect(messages[1].content).toBe('Hello');
    });
  });

  describe('getLastMessageByRole', () => {
    it('should return last message for role', () => {
      state = addMessage(state, { role: 'user', content: 'First', timestamp: 1 });
      state = addMessage(state, { role: 'assistant', content: 'Response', timestamp: 2 });
      state = addMessage(state, { role: 'user', content: 'Second', timestamp: 3 });

      const lastUser = getLastMessageByRole(state, 'user');
      const lastAssistant = getLastMessageByRole(state, 'assistant');

      expect(lastUser?.content).toBe('Second');
      expect(lastAssistant?.content).toBe('Response');
    });

    it('should return undefined if no message for role', () => {
      state = addMessage(state, { role: 'user', content: 'Hi' });

      expect(getLastMessageByRole(state, 'assistant')).toBeUndefined();
    });
  });

  describe('getRecentMessages', () => {
    it('should return last N messages', () => {
      state = addMessage(state, { role: 'user', content: '1' });
      state = addStatus(state, { type: 'info', message: 'Status' });
      state = addMessage(state, { role: 'assistant', content: '2' });
      state = addMessage(state, { role: 'user', content: '3' });

      const recent = getRecentMessages(state, 2);

      expect(recent).toHaveLength(2);
    });
  });

  describe('isAwaitingResponse', () => {
    it('should return true when last message is from user', () => {
      state = addMessage(state, { role: 'user', content: 'Hi', timestamp: 1 });

      expect(isAwaitingResponse(state)).toBe(true);
    });

    it('should return false when last message is from assistant', () => {
      state = addMessage(state, { role: 'user', content: 'Hi', timestamp: 1 });
      state = addMessage(state, { role: 'assistant', content: 'Hello', timestamp: 2 });

      expect(isAwaitingResponse(state)).toBe(false);
    });

    it('should return false when no messages', () => {
      expect(isAwaitingResponse(state)).toBe(false);
    });

    it('should use timestamps to determine order', () => {
      state = addMessage(state, { role: 'assistant', content: 'Earlier', timestamp: 1 });
      state = addMessage(state, { role: 'user', content: 'Later', timestamp: 2 });

      expect(isAwaitingResponse(state)).toBe(true);
    });
  });

  describe('getCurrentDisplayContent', () => {
    it('should return streaming content when streaming', () => {
      state = addMessage(state, { role: 'assistant', content: 'Previous' });
      state = startStreaming(state, 'req-1', 'Current stream');

      expect(getCurrentDisplayContent(state)).toBe('Current stream');
    });

    it('should return last assistant message when not streaming', () => {
      state = addMessage(state, { role: 'assistant', content: 'Last message' });

      expect(getCurrentDisplayContent(state)).toBe('Last message');
    });

    it('should return null when no content', () => {
      expect(getCurrentDisplayContent(state)).toBeNull();
    });
  });

  describe('getMessageStats', () => {
    it('should return correct statistics', () => {
      state = addMessage(state, { role: 'user', content: 'Hi' });
      state = addMessage(state, { role: 'assistant', content: 'Hello' });
      state = addToolResult(state, {
        toolName: 'test',
        toolCallId: '1',
        args: {},
        status: 'success',
        durationMs: 10,
      });
      state = addStatus(state, { type: 'info', message: 'Info' });
      state = addWorkerStart(state, 'w1', 'Task');
      state = addWorkerComplete(state, 'w1', true);

      const stats = getMessageStats(state);

      expect(stats.total).toBe(6);
      expect(stats.messages).toBe(2);
      expect(stats.toolResults).toBe(1);
      expect(stats.statuses).toBe(1);
      expect(stats.workerEvents).toBe(2);
    });
  });

  describe('immutability', () => {
    it('should not mutate original state', () => {
      const original = createMessageState();

      addMessage(original, { role: 'user', content: 'Hi' });

      expect(original.messages).toHaveLength(0);
    });
  });
});
