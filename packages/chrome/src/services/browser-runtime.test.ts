/**
 * Browser Runtime Tests
 *
 * Tests for the BrowserWorkerRuntime, specifically verifying that:
 * - Tool approvals are properly enforced in runWithInput()
 * - Attachments cannot bypass approval requirements
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the AI service and streamText before importing the runtime
vi.mock('./ai-service', () => ({
  browserAIService: {
    getDefaultModelId: vi.fn().mockResolvedValue('mock:model'),
    createModel: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('@golem-forge/core', async (importOriginal) => {
  const actual = await importOriginal() as Record<string, unknown>;
  return {
    ...actual,
    streamText: vi.fn(),
    ToolsetRegistry: {
      get: vi.fn().mockReturnValue(null),
    },
    workerNeedsSandbox: vi.fn().mockReturnValue(false),
  };
});

// Import after mocks
import { BrowserWorkerRuntime, type BrowserRuntimeOptions } from './browser-runtime';
import { streamText } from '@golem-forge/core';
import type { ApprovalRequest, ApprovalDecision, RuntimeUI } from '@golem-forge/core';

// For testing, we use a minimal worker that satisfies the runtime's actual usage
// (name and instructions). The full WorkerDefinition has many required fields,
// but BrowserWorkerRuntime only accesses name and instructions in our test scenarios.

// Helper to create a mock stream result
function createMockStreamResult(toolCalls: Array<{ toolCallId: string; toolName: string; args: unknown }> = []) {
  const parts: Array<{ type: string; [key: string]: unknown }> = [];

  // Add tool calls
  for (const tc of toolCalls) {
    parts.push({
      type: 'tool-call',
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      args: tc.args,
    });
  }

  // Add finish event
  parts.push({
    type: 'finish',
    usage: { promptTokens: 10, completionTokens: 20 },
  });

  return {
    fullStream: (async function* () {
      for (const part of parts) {
        yield part;
      }
    })(),
    usage: Promise.resolve({ inputTokens: 10, outputTokens: 20 }),
  };
}

describe('BrowserWorkerRuntime Approval Flow', () => {
  let mockApprovalCallback: ReturnType<typeof vi.fn<[ApprovalRequest], Promise<ApprovalDecision>>>;
  let mockRuntimeUI: RuntimeUI;

  beforeEach(() => {
    vi.clearAllMocks();

    mockApprovalCallback = vi.fn().mockResolvedValue({ approved: false, note: 'Denied by test', remember: 'none' });

    mockRuntimeUI = {
      startStreaming: vi.fn(),
      appendStreaming: vi.fn(),
      endStreaming: vi.fn(),
      showToolStarted: vi.fn(),
      showToolResult: vi.fn(),
      requestApproval: vi.fn().mockResolvedValue({ approved: false, reason: 'Denied by test' }),
      addMessage: vi.fn(),
      addStatus: vi.fn(),
    } as unknown as RuntimeUI;
  });

  describe('runWithInput() approval enforcement', () => {
    it('should deny tool execution when approval is rejected via callback', async () => {
      // Setup: A tool that requires approval
      const worker = {
        name: 'test-worker',
        instructions: 'Test instructions',
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const options = {
        worker,
        approvalMode: 'interactive',
        approvalCallback: mockApprovalCallback,
      } as any as BrowserRuntimeOptions;

      const runtime = new BrowserWorkerRuntime(options);

      // Manually set up tools with needsApproval: true
      const mockTool = {
        name: 'dangerous_tool',
        execute: vi.fn().mockResolvedValue({ success: true }),
        needsApproval: true,
      };

      // Access private tools field
      (runtime as unknown as { tools: Record<string, unknown> }).tools = {
        dangerous_tool: mockTool,
      };

      // Setup streamText to return a tool call
      vi.mocked(streamText).mockReturnValue(createMockStreamResult([
        { toolCallId: 'tc1', toolName: 'dangerous_tool', args: { action: 'delete' } },
      ]));

      // Mark as initialized
      (runtime as unknown as { initialized: boolean }).initialized = true;
      (runtime as unknown as { model: unknown }).model = {};

      // Execute with object input (runWithInput path)
      await runtime.runWithInput({
        content: 'Delete all files',
        attachments: [],
      });

      // Verify approval was requested
      expect(mockApprovalCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'dangerous_tool',
          toolArgs: { action: 'delete' },
        })
      );

      // Verify tool was NOT executed because approval was denied
      expect(mockTool.execute).not.toHaveBeenCalled();
    });

    it('should deny tool execution when approval is rejected via runtimeUI', async () => {
      const worker = {
        name: 'test-worker',
        instructions: 'Test instructions',
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const options = {
        worker,
        runtimeUI: mockRuntimeUI,
      } as any as BrowserRuntimeOptions;

      const runtime = new BrowserWorkerRuntime(options);

      const mockTool = {
        name: 'write_file',
        execute: vi.fn().mockResolvedValue({ success: true }),
        needsApproval: true,
      };

      (runtime as unknown as { tools: Record<string, unknown> }).tools = {
        write_file: mockTool,
      };

      vi.mocked(streamText).mockReturnValue(createMockStreamResult([
        { toolCallId: 'tc1', toolName: 'write_file', args: { path: '/etc/passwd', content: 'hacked' } },
      ]));

      (runtime as unknown as { initialized: boolean }).initialized = true;
      (runtime as unknown as { model: unknown }).model = {};

      await runtime.runWithInput({
        content: 'Write file',
        attachments: [],
      });

      // Verify approval was requested via runtimeUI
      expect(mockRuntimeUI.requestApproval).toHaveBeenCalled();

      // Verify tool was NOT executed
      expect(mockTool.execute).not.toHaveBeenCalled();
    });

    it('should allow tool execution when approval is granted', async () => {
      mockApprovalCallback.mockResolvedValue({ approved: true, remember: 'none' });

      const worker = {
        name: 'test-worker',
        instructions: 'Test instructions',
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const options = {
        worker,
        approvalMode: 'interactive',
        approvalCallback: mockApprovalCallback,
      } as any as BrowserRuntimeOptions;

      const runtime = new BrowserWorkerRuntime(options);

      const mockTool = {
        name: 'safe_tool',
        execute: vi.fn().mockResolvedValue({ success: true }),
        needsApproval: true,
      };

      (runtime as unknown as { tools: Record<string, unknown> }).tools = {
        safe_tool: mockTool,
      };

      // First call returns tool call, second call returns empty (conversation done)
      let callCount = 0;
      vi.mocked(streamText).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createMockStreamResult([
            { toolCallId: 'tc1', toolName: 'safe_tool', args: { data: 'test' } },
          ]);
        }
        // Second call - no more tool calls
        return {
          fullStream: (async function* () {
            yield { type: 'text-delta', textDelta: 'Done' };
            yield { type: 'finish', usage: { promptTokens: 10, completionTokens: 20 } };
          })(),
          usage: Promise.resolve({ inputTokens: 10, outputTokens: 20 }),
        };
      });

      (runtime as unknown as { initialized: boolean }).initialized = true;
      (runtime as unknown as { model: unknown }).model = {};

      await runtime.runWithInput({
        content: 'Do something safe',
        attachments: [],
      });

      // Verify approval was requested
      expect(mockApprovalCallback).toHaveBeenCalled();

      // Verify tool WAS executed because approval was granted
      expect(mockTool.execute).toHaveBeenCalled();
    });

    it('should execute tools without approval if needsApproval is false', async () => {
      const worker = {
        name: 'test-worker',
        instructions: 'Test instructions',
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const options = {
        worker,
        approvalMode: 'interactive',
        approvalCallback: mockApprovalCallback,
      } as any as BrowserRuntimeOptions;

      const runtime = new BrowserWorkerRuntime(options);

      const mockTool = {
        name: 'read_file',
        execute: vi.fn().mockResolvedValue({ content: 'file contents' }),
        needsApproval: false, // No approval needed
      };

      (runtime as unknown as { tools: Record<string, unknown> }).tools = {
        read_file: mockTool,
      };

      let callCount = 0;
      vi.mocked(streamText).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createMockStreamResult([
            { toolCallId: 'tc1', toolName: 'read_file', args: { path: '/test.txt' } },
          ]);
        }
        return {
          fullStream: (async function* () {
            yield { type: 'text-delta', textDelta: 'Read file' };
            yield { type: 'finish', usage: { promptTokens: 10, completionTokens: 20 } };
          })(),
          usage: Promise.resolve({ inputTokens: 10, outputTokens: 20 }),
        };
      });

      (runtime as unknown as { initialized: boolean }).initialized = true;
      (runtime as unknown as { model: unknown }).model = {};

      await runtime.runWithInput({
        content: 'Read a file',
        attachments: [],
      });

      // Verify approval was NOT requested
      expect(mockApprovalCallback).not.toHaveBeenCalled();

      // Verify tool WAS executed (no approval needed)
      expect(mockTool.execute).toHaveBeenCalled();
    });

    it('should handle dynamic needsApproval function', async () => {
      const worker = {
        name: 'test-worker',
        instructions: 'Test instructions',
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const options = {
        worker,
        approvalMode: 'interactive',
        approvalCallback: mockApprovalCallback,
      } as any as BrowserRuntimeOptions;

      const runtime = new BrowserWorkerRuntime(options);

      // Tool with dynamic needsApproval based on args
      const dynamicNeedsApproval = vi.fn().mockImplementation((args: { dangerous?: boolean }) => {
        return args.dangerous === true;
      });

      const mockTool = {
        name: 'dynamic_tool',
        execute: vi.fn().mockResolvedValue({ success: true }),
        needsApproval: dynamicNeedsApproval,
      };

      (runtime as unknown as { tools: Record<string, unknown> }).tools = {
        dynamic_tool: mockTool,
      };

      let callCount = 0;
      vi.mocked(streamText).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createMockStreamResult([
            { toolCallId: 'tc1', toolName: 'dynamic_tool', args: { dangerous: true } },
          ]);
        }
        return {
          fullStream: (async function* () {
            yield { type: 'text-delta', textDelta: 'Done' };
            yield { type: 'finish', usage: { promptTokens: 10, completionTokens: 20 } };
          })(),
          usage: Promise.resolve({ inputTokens: 10, outputTokens: 20 }),
        };
      });

      (runtime as unknown as { initialized: boolean }).initialized = true;
      (runtime as unknown as { model: unknown }).model = {};

      await runtime.runWithInput({
        content: 'Do dangerous thing',
        attachments: [],
      });

      // Verify needsApproval was called with correct args
      expect(dynamicNeedsApproval).toHaveBeenCalledWith(
        { dangerous: true },
        expect.objectContaining({ toolCallId: 'tc1' })
      );

      // Verify approval was requested (because needsApproval returned true)
      expect(mockApprovalCallback).toHaveBeenCalled();

      // Verify tool was NOT executed (approval denied)
      expect(mockTool.execute).not.toHaveBeenCalled();
    });

    it('should enforce approvals even with attachments present', async () => {
      const worker = {
        name: 'test-worker',
        instructions: 'Test instructions',
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const options = {
        worker,
        approvalMode: 'interactive',
        approvalCallback: mockApprovalCallback,
      } as any as BrowserRuntimeOptions;

      const runtime = new BrowserWorkerRuntime(options);

      const mockTool = {
        name: 'process_image',
        execute: vi.fn().mockResolvedValue({ success: true }),
        needsApproval: true,
      };

      (runtime as unknown as { tools: Record<string, unknown> }).tools = {
        process_image: mockTool,
      };

      vi.mocked(streamText).mockReturnValue(createMockStreamResult([
        { toolCallId: 'tc1', toolName: 'process_image', args: { action: 'delete' } },
      ]));

      (runtime as unknown as { initialized: boolean }).initialized = true;
      (runtime as unknown as { model: unknown }).model = {};

      // Call with attachments - this should still enforce approvals
      await runtime.runWithInput({
        content: 'Process this image and delete originals',
        attachments: [
          {
            name: 'test.png',
            mimeType: 'image/png',
            data: new Uint8Array([1, 2, 3]),
          },
        ],
      });

      // CRITICAL: Verify approval was requested even with attachments
      expect(mockApprovalCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'process_image',
        })
      );

      // CRITICAL: Verify tool was NOT executed because approval was denied
      expect(mockTool.execute).not.toHaveBeenCalled();
    });
  });
});
