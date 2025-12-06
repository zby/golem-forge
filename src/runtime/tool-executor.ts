/**
 * Tool Executor
 *
 * Handles individual tool execution with approval flow.
 * Extracted from WorkerRuntime to improve testability and separation of concerns.
 */

import type { Tool, ModelMessage } from "ai";
import type { ApprovalController } from "../approval/index.js";
import type { RuntimeEventCallback, RuntimeEventData } from "./events.js";

/**
 * A tool call to be executed.
 */
export interface ToolCall {
  toolCallId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
}

/**
 * Context for tool execution.
 */
export interface ToolExecutionContext {
  /** Full message history (some tools may need it) */
  messages: ModelMessage[];
  /** Current iteration number (1-based) */
  iteration: number;
}

/**
 * Result of executing a tool.
 */
export interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  /** The tool output (can be any JSON-serializable value) */
  output: unknown;
  /** Whether the output is an error */
  isError: boolean;
  /** How long execution took */
  durationMs: number;
}

/**
 * Options for creating a ToolExecutor.
 */
export interface ToolExecutorOptions {
  /** Registry of available tools */
  tools: Record<string, Tool>;
  /** Controller for approval decisions */
  approvalController: ApprovalController;
  /** Optional event callback for observability */
  onEvent?: RuntimeEventCallback;
}

/**
 * Executes tools with approval handling and event emission.
 *
 * Responsibilities:
 * - Look up tool in registry
 * - Resolve needsApproval (static boolean or dynamic function)
 * - Request approval via controller if needed
 * - Execute tool with proper error handling
 * - Emit events for observability
 * - Track duration
 */
export class ToolExecutor {
  private tools: Record<string, Tool>;
  private approvalController: ApprovalController;
  private onEvent?: RuntimeEventCallback;

  constructor(options: ToolExecutorOptions) {
    this.tools = options.tools;
    this.approvalController = options.approvalController;
    this.onEvent = options.onEvent;
  }

  /**
   * Emit a runtime event if callback is registered.
   */
  private emit(event: RuntimeEventData): void {
    if (this.onEvent) {
      this.onEvent({ ...event, timestamp: new Date() });
    }
  }

  /**
   * Execute a single tool call with approval handling.
   */
  async execute(
    toolCall: ToolCall,
    context: ToolExecutionContext,
    batchInfo?: { toolIndex: number; toolTotal: number }
  ): Promise<ToolExecutionResult> {
    const { toolCallId, toolName, toolArgs } = toolCall;
    const startTime = Date.now();

    // Emit tool_call_start event
    this.emit({
      type: "tool_call_start",
      iteration: context.iteration,
      toolIndex: batchInfo?.toolIndex ?? 1,
      toolTotal: batchInfo?.toolTotal ?? 1,
      toolCallId,
      toolName,
      toolArgs,
    });

    let output: unknown;
    let isError = false;

    const tool = this.tools[toolName];

    if (!tool) {
      output = `Error: Tool not found: ${toolName}`;
      isError = true;
    } else if (!tool.execute) {
      output = `Error: Tool ${toolName} has no execute function`;
      isError = true;
    } else {
      // Check if tool needs approval
      const needsApproval = typeof tool.needsApproval === "function"
        ? await tool.needsApproval(toolArgs, { toolCallId, messages: context.messages })
        : tool.needsApproval;

      if (needsApproval) {
        // Emit approval_request event
        this.emit({
          type: "approval_request",
          toolName,
          toolArgs,
          description: `Execute tool: ${toolName}`,
        });

        // Get approval from controller
        const decision = await this.approvalController.requestApproval({
          toolName,
          toolArgs,
          description: `Execute tool: ${toolName}`,
        });

        // Emit approval_decision event
        this.emit({
          type: "approval_decision",
          toolName,
          approved: decision.approved,
          cached: false, // TODO: detect if cached from controller
          remember: decision.remember || "none",
        });

        if (!decision.approved) {
          output = `Error: [DENIED] Tool execution denied${decision.note ? `: ${decision.note}` : ""}`;
          isError = true;
        } else {
          // Execute approved tool
          try {
            output = await tool.execute(toolArgs, { toolCallId, messages: context.messages });
          } catch (err) {
            output = `Error: ${err instanceof Error ? err.message : String(err)}`;
            isError = true;
          }
        }
      } else {
        // Pre-approved, execute directly
        try {
          output = await tool.execute(toolArgs, { toolCallId, messages: context.messages });
        } catch (err) {
          output = `Error: ${err instanceof Error ? err.message : String(err)}`;
          isError = true;
        }
      }
    }

    const durationMs = Date.now() - startTime;

    // Emit tool_call_end or tool_call_error event
    const outputStr = typeof output === "string" ? output : JSON.stringify(output);
    const maxOutputLen = 1000;

    if (isError) {
      this.emit({
        type: "tool_call_error",
        iteration: context.iteration,
        toolCallId,
        toolName,
        error: outputStr,
      });
    } else {
      this.emit({
        type: "tool_call_end",
        iteration: context.iteration,
        toolCallId,
        toolName,
        output: outputStr.length > maxOutputLen ? outputStr.slice(0, maxOutputLen) : outputStr,
        truncated: outputStr.length > maxOutputLen,
        durationMs,
      });
    }

    return {
      toolCallId,
      toolName,
      output,
      isError,
      durationMs,
    };
  }

  /**
   * Execute multiple tool calls sequentially.
   *
   * Future: could add executeParallel() for concurrent execution
   * of tools that don't conflict (e.g., read-only tools).
   */
  async executeBatch(
    toolCalls: ToolCall[],
    context: ToolExecutionContext
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];
    const toolTotal = toolCalls.length;

    for (let i = 0; i < toolCalls.length; i++) {
      const result = await this.execute(toolCalls[i], context, {
        toolIndex: i + 1,
        toolTotal,
      });
      results.push(result);
    }

    return results;
  }
}
