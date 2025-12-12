/**
 * Tool Executor
 *
 * Handles individual tool execution with approval flow.
 * Platform-agnostic implementation that can be used by CLI, browser, or other runtimes.
 */

import type { Tool } from "ai";
import type { ApprovalController } from "../approval/index.js";
import type { RuntimeUI } from "../runtime-ui.js";
import { isToolResultValue, type ToolResultValue } from "../ui-events.js";
import type { RuntimeEventCallback, RuntimeEventData } from "./events.js";
import type {
  ToolCall,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolExecutorOptions,
} from "./types.js";

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
  private runtimeUI?: RuntimeUI;

  constructor(options: ToolExecutorOptions) {
    this.tools = options.tools;
    this.approvalController = options.approvalController;
    this.onEvent = options.onEvent;
    this.runtimeUI = options.runtimeUI;
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

    // Emit UI toolStarted event
    if (this.runtimeUI) {
      this.runtimeUI.showToolStarted(toolCallId, toolName, toolArgs);
    }

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
      // Cast messages to any to satisfy AI SDK's type requirements
      const needsApproval = typeof tool.needsApproval === "function"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? await tool.needsApproval(toolArgs, { toolCallId, messages: context.messages as any })
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            output = await tool.execute(toolArgs, { toolCallId, messages: context.messages as any });
          } catch (err) {
            output = `Error: ${err instanceof Error ? err.message : String(err)}`;
            isError = true;
          }
        }
      } else {
        // Pre-approved, execute directly
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          output = await tool.execute(toolArgs, { toolCallId, messages: context.messages as any });
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

    // Emit UI tool result event
    if (this.runtimeUI) {
      const status = isError ? 'error' : 'success';
      const error = isError ? (typeof output === 'string' ? output : String(output)) : undefined;

      let uiValue: ToolResultValue | undefined;
      if (!isError) {
        if (isToolResultValue(output)) {
          uiValue = output;
        } else if (output !== undefined) {
          uiValue =
            typeof output === 'string'
              ? { kind: 'text', content: output }
              : { kind: 'json', data: output };
        }
      }

      this.runtimeUI.showToolResult(
        toolCallId,
        toolName,
        toolArgs,
        status,
        durationMs,
        uiValue,
        error
      );
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
