/**
 * Browser Worker Runtime
 *
 * Executes workers in the browser extension environment.
 * Uses streamText for real-time streaming responses.
 */

import { streamText, type LanguageModel, type Tool } from 'ai';
import { z } from 'zod';
import type { WorkerDefinition } from './worker-manager';
import { browserAIService } from './ai-service';
import {
  type MountSandbox,
  type FileOperations,
  createOPFSSandbox,
  NotFoundError,
  SandboxError,
} from './opfs-sandbox';

// ─────────────────────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────────────────────

const LOG_PREFIX = '[GolemForge Runtime]';

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, ...args);
}

function logError(...args: unknown[]) {
  console.error(LOG_PREFIX, ...args);
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Handling
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Known error patterns from AI SDK that need sanitization.
 */
const ERROR_PATTERNS = [
  {
    pattern: /Run 'npx vercel link'/i,
    message: 'API configuration error. Please check your API key in Settings.',
  },
  {
    pattern: /vercel.*gateway/i,
    message: 'Provider configuration error. Please verify your API key.',
  },
  {
    pattern: /VERCEL_AI_TOKEN/i,
    message: 'API authentication failed. Please check your API key in Settings.',
  },
  {
    pattern: /invalid_api_key/i,
    message: 'Invalid API key. Please check your API key in Settings.',
  },
  {
    pattern: /401|unauthorized/i,
    message: 'API key unauthorized. Please verify your API key in Settings.',
  },
  {
    pattern: /403|forbidden/i,
    message: 'Access forbidden. Your API key may not have access to this model.',
  },
  {
    pattern: /rate.?limit/i,
    message: 'Rate limit exceeded. Please wait a moment and try again.',
  },
  {
    pattern: /insufficient.?funds|credit|billing/i,
    message: 'Account billing issue. Please check your API provider account.',
  },
  {
    pattern: /model.*not.*found|invalid.*model/i,
    message: 'Model not found. Please check your model selection in Settings.',
  },
];

/**
 * Sanitize error messages to make them user-friendly.
 *
 * The AI SDK can produce very long, cryptic errors especially when
 * falling back to Vercel's gateway. This function extracts useful info.
 */
function sanitizeErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);

  // Log the full error for debugging
  logError('Raw error:', rawMessage.slice(0, 500) + (rawMessage.length > 500 ? '...' : ''));

  // Check for known patterns
  for (const { pattern, message } of ERROR_PATTERNS) {
    if (pattern.test(rawMessage)) {
      return message;
    }
  }

  // If the error message is too long (contains bundled code), truncate it
  if (rawMessage.length > 500) {
    // Try to extract the first meaningful line
    const firstLine = rawMessage.split('\n')[0];
    if (firstLine && firstLine.length < 200) {
      return firstLine;
    }
    return 'An error occurred while processing your request. Check console for details.';
  }

  return rawMessage;
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Result of a worker execution.
 */
export interface WorkerResult {
  success: boolean;
  response?: string;
  error?: string;
  toolCallCount: number;
  tokens?: { input: number; output: number };
}

/**
 * Approval mode for tool execution.
 */
export type ApprovalMode = 'interactive' | 'approve_all' | 'auto_deny';

/**
 * Request for user approval.
 */
export interface ApprovalRequest {
  toolName: string;
  toolArgs: Record<string, unknown>;
  description: string;
}

/**
 * User's approval decision.
 */
export interface ApprovalDecision {
  approved: boolean;
  note?: string;
  remember: 'none' | 'session';
}

/**
 * Callback for approval requests.
 */
export type ApprovalCallback = (request: ApprovalRequest) => Promise<ApprovalDecision>;

/**
 * Callback for streaming text updates.
 */
export type StreamCallback = (text: string) => void;

/**
 * Callback for tool execution updates.
 */
export type ToolCallback = (toolName: string, args: Record<string, unknown>, result: unknown) => void;

/**
 * Options for running a worker.
 */
export interface BrowserRuntimeOptions {
  /** The worker definition to execute */
  worker: WorkerDefinition;
  /** Model ID (e.g., "anthropic:claude-sonnet-4-20250514") */
  modelId?: string;
  /** Program ID for sandbox access */
  programId?: string;
  /** Approval mode */
  approvalMode?: ApprovalMode;
  /** Callback for approval requests (required for interactive mode) */
  approvalCallback?: ApprovalCallback;
  /** Maximum iterations */
  maxIterations?: number;
  /** Callback for streaming text */
  onStream?: StreamCallback;
  /** Callback for tool calls */
  onToolCall?: ToolCallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// Approval Controller (simplified for browser)
// ─────────────────────────────────────────────────────────────────────────────

class BrowserApprovalController {
  private mode: ApprovalMode;
  private callback?: ApprovalCallback;
  private sessionCache = new Map<string, ApprovalDecision>();

  constructor(mode: ApprovalMode, callback?: ApprovalCallback) {
    this.mode = mode;
    this.callback = callback;

    if (mode === 'interactive' && !callback) {
      throw new Error('Interactive mode requires an approval callback');
    }
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalDecision> {
    if (this.mode === 'approve_all') {
      return { approved: true, remember: 'none' };
    }

    if (this.mode === 'auto_deny') {
      return { approved: false, note: 'Auto-deny mode', remember: 'none' };
    }

    // Check session cache
    const cacheKey = `${request.toolName}:${JSON.stringify(request.toolArgs)}`;
    const cached = this.sessionCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Request approval via callback
    const decision = await this.callback!(request);

    // Cache if approved with remember=session
    if (decision.approved && decision.remember === 'session') {
      this.sessionCache.set(cacheKey, decision);
    }

    return decision;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool Creation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create filesystem tools for the browser sandbox.
 */
function createFilesystemTools(
  sandbox: FileOperations,
  approvalController: BrowserApprovalController
): Record<string, Tool> {
  const tools: Record<string, Tool> = {};

  // read_file tool
  tools['read_file'] = {
    description: 'Read the contents of a text file',
    inputSchema: z.object({
      path: z.string().describe('Absolute path to the file (e.g., /dirname/file.txt)'),
    }),
    execute: async ({ path }: { path: string }) => {
      try {
        const content = await sandbox.read(path);
        return { success: true, path, content };
      } catch (error) {
        if (error instanceof NotFoundError) {
          return { success: false, error: `File not found: ${path}` };
        }
        return { success: false, error: String(error) };
      }
    },
  };

  // write_file tool (needs approval)
  tools['write_file'] = {
    description: 'Write content to a file',
    inputSchema: z.object({
      path: z.string().describe('Absolute path to write to'),
      content: z.string().describe('Content to write'),
    }),
    needsApproval: true,
    execute: async ({ path, content }: { path: string; content: string }) => {
      // Request approval
      const decision = await approvalController.requestApproval({
        toolName: 'write_file',
        toolArgs: { path, content: content.slice(0, 200) + (content.length > 200 ? '...' : '') },
        description: `Write to file: ${path}`,
      });

      if (!decision.approved) {
        return { success: false, error: `Operation denied: ${decision.note || 'User rejected'}` };
      }

      try {
        await sandbox.write(path, content);
        return { success: true, path, bytesWritten: content.length };
      } catch (error) {
        if (error instanceof SandboxError) {
          return { success: false, error: error.message };
        }
        return { success: false, error: String(error) };
      }
    },
  };

  // list_files tool
  tools['list_files'] = {
    description: 'List files and directories in a path',
    inputSchema: z.object({
      path: z.string().describe('Directory path to list'),
    }),
    execute: async ({ path }: { path: string }) => {
      try {
        const files = await sandbox.list(path);
        return { success: true, path, files, count: files.length };
      } catch (error) {
        if (error instanceof NotFoundError) {
          return { success: false, error: `Directory not found: ${path}` };
        }
        return { success: false, error: String(error) };
      }
    },
  };

  // delete_file tool (needs approval)
  tools['delete_file'] = {
    description: 'Delete a file',
    inputSchema: z.object({
      path: z.string().describe('Absolute path to delete'),
    }),
    needsApproval: true,
    execute: async ({ path }: { path: string }) => {
      const decision = await approvalController.requestApproval({
        toolName: 'delete_file',
        toolArgs: { path },
        description: `Delete file: ${path}`,
      });

      if (!decision.approved) {
        return { success: false, error: `Operation denied: ${decision.note || 'User rejected'}` };
      }

      try {
        await sandbox.delete(path);
        return { success: true, path, deleted: true };
      } catch (error) {
        if (error instanceof NotFoundError) {
          return { success: false, error: `File not found: ${path}` };
        }
        return { success: false, error: String(error) };
      }
    },
  };

  // file_exists tool
  tools['file_exists'] = {
    description: 'Check if a file or directory exists',
    inputSchema: z.object({
      path: z.string().describe('Path to check'),
    }),
    execute: async ({ path }: { path: string }) => {
      const exists = await sandbox.exists(path);
      return { success: true, path, exists };
    },
  };

  // file_info tool
  tools['file_info'] = {
    description: 'Get metadata about a file',
    inputSchema: z.object({
      path: z.string().describe('Path to the file'),
    }),
    execute: async ({ path }: { path: string }) => {
      try {
        const stat = await sandbox.stat(path);
        return {
          success: true,
          path: stat.path,
          size: stat.size,
          isDirectory: stat.isDirectory,
          modifiedAt: stat.modifiedAt.toISOString(),
        };
      } catch (error) {
        if (error instanceof NotFoundError) {
          return { success: false, error: `File not found: ${path}` };
        }
        return { success: false, error: String(error) };
      }
    },
  };

  return tools;
}

// ─────────────────────────────────────────────────────────────────────────────
// Message Types (simplified for browser runtime)
// ─────────────────────────────────────────────────────────────────────────────

interface SystemMessage {
  role: 'system';
  content: string;
}

interface UserMessage {
  role: 'user';
  content: string;
}

interface AssistantMessage {
  role: 'assistant';
  content: Array<{ type: 'text'; text: string } | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown }>;
}

interface ToolMessage {
  role: 'tool';
  content: Array<{ type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }>;
}

type Message = SystemMessage | UserMessage | AssistantMessage | ToolMessage;

// ─────────────────────────────────────────────────────────────────────────────
// Browser Worker Runtime
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Browser Worker Runtime.
 *
 * Executes workers in the browser with:
 * - OPFS-based sandbox for file operations
 * - streamText for real-time streaming
 * - Browser-safe AI provider configuration
 */
export class BrowserWorkerRuntime {
  private worker: WorkerDefinition;
  private options: BrowserRuntimeOptions;
  private model?: LanguageModel;
  private sandbox?: MountSandbox;
  private tools: Record<string, Tool> = {};
  private approvalController: BrowserApprovalController;
  private initialized = false;

  constructor(options: BrowserRuntimeOptions) {
    this.worker = options.worker;
    this.options = options;

    // Create approval controller
    this.approvalController = new BrowserApprovalController(
      options.approvalMode || 'interactive',
      options.approvalCallback
    );
  }

  /**
   * Initialize the runtime.
   * Creates sandbox and registers tools.
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    log('Initializing runtime for worker:', this.worker.name);

    // Create model
    const modelId = this.options.modelId || await browserAIService.getDefaultModelId();
    log('Using model:', modelId);

    try {
      this.model = await browserAIService.createModel(modelId);
      log('Model created successfully');
    } catch (error) {
      logError('Failed to create model:', error);
      throw new Error(sanitizeErrorMessage(error));
    }

    // Create sandbox if program ID is provided
    if (this.options.programId) {
      log('Creating sandbox for program:', this.options.programId);
      this.sandbox = await createOPFSSandbox({
        root: `/projects/${this.options.programId}`, // Path kept as 'projects' for backwards compatibility
      });

      // Apply worker sandbox restrictions
      if (this.worker.sandbox) {
        this.sandbox = this.sandbox.restrict({
          restrict: this.worker.sandbox.restrict,
          readonly: this.worker.sandbox.readonly,
        }) as MountSandbox;
      }
    }

    // Register tools based on worker config
    await this.registerTools();
    log('Registered tools:', Object.keys(this.tools));

    this.initialized = true;
    log('Runtime initialized');
  }

  /**
   * Register tools based on worker configuration.
   */
  private async registerTools(): Promise<void> {
    const toolsetsConfig = this.worker.toolsets || {};

    for (const [toolsetName] of Object.entries(toolsetsConfig)) {
      switch (toolsetName) {
        case 'filesystem': {
          if (!this.sandbox) {
            throw new Error('Filesystem toolset requires a program. Set programId in options.');
          }
          const fsTools = createFilesystemTools(this.sandbox, this.approvalController);
          Object.assign(this.tools, fsTools);
          break;
        }

        // Other toolsets can be added here
        // case 'git': ...
        // case 'web': ...

        default:
          console.warn(`Unknown toolset "${toolsetName}" - skipping`);
      }
    }
  }

  /**
   * Execute the worker with the given input.
   *
   * Uses streamText for real-time streaming of responses.
   */
  async run(input: string): Promise<WorkerResult> {
    if (!this.initialized) {
      throw new Error('Runtime not initialized. Call initialize() first.');
    }

    log('Running worker with input:', input.slice(0, 100) + (input.length > 100 ? '...' : ''));

    const maxIterations = this.options.maxIterations || 50;
    let toolCallCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    try {
      // Build initial messages
      const messages: Message[] = [
        { role: 'system', content: this.worker.instructions },
        { role: 'user', content: input },
      ];

      const hasTools = Object.keys(this.tools).length > 0;

      for (let iteration = 0; iteration < maxIterations; iteration++) {
        log('Iteration', iteration + 1, '/', maxIterations);

        // Call streamText - use type assertion to avoid complex type issues with AI SDK
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let result;
        try {
          result = await streamText({
            model: this.model!,
            messages: messages as any,
            tools: hasTools ? this.tools : undefined,
            maxOutputTokens: 4096,
          });
        } catch (streamError) {
          // Catch errors from streamText initialization
          throw new Error(sanitizeErrorMessage(streamError));
        }

        // Collect the full response
        let fullText = '';
        const toolCalls: Array<{
          toolCallId: string;
          toolName: string;
          args: Record<string, unknown>;
        }> = [];

        // Stream the response
        try {
          for await (const part of result.fullStream) {
            if (part.type === 'text-delta') {
              fullText += part.textDelta;
              this.options.onStream?.(part.textDelta);
            } else if (part.type === 'tool-call') {
              toolCalls.push({
                toolCallId: part.toolCallId,
                toolName: part.toolName,
                args: part.args as Record<string, unknown>,
              });
            }
          }
        } catch (streamError) {
          // Catch errors during streaming (e.g., API errors)
          throw new Error(sanitizeErrorMessage(streamError));
        }

        // Get final usage
        const usage = await result.usage;
        totalInputTokens += usage.inputTokens ?? 0;
        totalOutputTokens += usage.outputTokens ?? 0;

        // If no tool calls, we're done
        if (toolCalls.length === 0) {
          return {
            success: true,
            response: fullText,
            toolCallCount,
            tokens: { input: totalInputTokens, output: totalOutputTokens },
          };
        }

        // Execute tool calls
        const toolResults: Array<{
          type: 'tool-result';
          toolCallId: string;
          toolName: string;
          result: unknown;
        }> = [];

        for (const tc of toolCalls) {
          toolCallCount++;

          const tool = this.tools[tc.toolName];
          let toolResult: unknown;

          if (!tool || !tool.execute) {
            toolResult = { error: `Tool not found: ${tc.toolName}` };
          } else {
            try {
              toolResult = await tool.execute(tc.args, {
                toolCallId: tc.toolCallId,
                messages: [],
              });
            } catch (err) {
              toolResult = { error: err instanceof Error ? err.message : String(err) };
            }
          }

          // Notify callback
          this.options.onToolCall?.(tc.toolName, tc.args, toolResult);

          toolResults.push({
            type: 'tool-result',
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            result: toolResult,
          });
        }

        // Add assistant message with tool calls
        messages.push({
          role: 'assistant',
          content: [
            ...(fullText ? [{ type: 'text' as const, text: fullText }] : []),
            ...toolCalls.map((tc) => ({
              type: 'tool-call' as const,
              toolCallId: tc.toolCallId,
              toolName: tc.toolName,
              args: tc.args,
            })),
          ],
        });

        // Add tool results
        messages.push({
          role: 'tool',
          content: toolResults,
        });
      }

      // Max iterations exceeded
      log('Max iterations exceeded:', maxIterations);
      return {
        success: false,
        error: `Maximum iterations (${maxIterations}) exceeded`,
        toolCallCount,
        tokens: { input: totalInputTokens, output: totalOutputTokens },
      };
    } catch (err) {
      const sanitizedError = sanitizeErrorMessage(err);
      logError('Worker execution failed:', sanitizedError);
      return {
        success: false,
        error: sanitizedError,
        toolCallCount,
        tokens: { input: totalInputTokens, output: totalOutputTokens },
      };
    }
  }

  /**
   * Get the sandbox (if available).
   */
  getSandbox(): FileOperations | undefined {
    return this.sandbox;
  }

  /**
   * Get registered tools.
   */
  getTools(): Record<string, Tool> {
    return this.tools;
  }
}

/**
 * Create and initialize a browser worker runtime.
 */
export async function createBrowserRuntime(
  options: BrowserRuntimeOptions
): Promise<BrowserWorkerRuntime> {
  const runtime = new BrowserWorkerRuntime(options);
  await runtime.initialize();
  return runtime;
}
