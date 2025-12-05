/**
 * Approved Tool Executor
 *
 * Wraps lemmy's tool execution with approval checking.
 * This is the integration layer between lemmy and the approval system.
 */

import type { Context, ToolCall, ExecuteToolResult, ToolError } from "@mariozechner/lemmy";
import {
  ApprovalController,
  ApprovalResult,
  type ApprovalRequest,
  type SecurityContext,
  type SupportsNeedsApproval,
  type SupportsApprovalDescription,
  supportsNeedsApproval,
  supportsApprovalDescription,
} from "../approval/index.js";

/**
 * A toolset that can provide custom approval logic and descriptions.
 */
export type ApprovalToolset = SupportsNeedsApproval<unknown> &
  Partial<SupportsApprovalDescription<unknown>>;

/**
 * Options for creating an ApprovedExecutor.
 */
export interface ApprovedExecutorOptions {
  /** The lemmy Context containing tools */
  context: Context;
  /** The approval controller to use */
  approvalController: ApprovalController;
  /** Optional toolset for custom approval logic */
  toolset?: ApprovalToolset;
  /** Security context for approval requests (trust level, etc.) */
  securityContext?: SecurityContext;
}

/**
 * Result of tool execution with approval information.
 */
export type ApprovedExecuteResult = ExecuteToolResult & {
  /** Whether the tool was blocked by policy */
  blocked?: boolean;
  /** Whether the tool was denied by user */
  denied?: boolean;
  /** Whether the tool was pre-approved (no prompt needed) */
  preApproved?: boolean;
};

/**
 * Executes tools with approval checking.
 *
 * Integrates lemmy's tool system with the approval system:
 * 1. Checks if tool needs approval (via toolset or default)
 * 2. If blocked, returns error without executing
 * 3. If pre-approved, executes immediately
 * 4. If needs approval, prompts via controller
 * 5. Executes or returns denial error
 */
export class ApprovedExecutor {
  private context: Context;
  private controller: ApprovalController;
  private toolset?: ApprovalToolset;
  private securityContext?: SecurityContext;

  constructor(options: ApprovedExecutorOptions) {
    this.context = options.context;
    this.controller = options.approvalController;
    this.toolset = options.toolset;
    this.securityContext = options.securityContext;
  }

  /**
   * Execute a single tool call with approval checking.
   */
  async executeTool(toolCall: ToolCall): Promise<ApprovedExecuteResult> {
    // 1. Check approval status
    const approvalResult = this.checkApproval(toolCall);

    // 2. Handle blocked
    if (approvalResult.isBlocked) {
      return this.createBlockedResult(toolCall, approvalResult.blockReason!);
    }

    // 3. Handle pre-approved - execute immediately
    if (approvalResult.isPreApproved) {
      const result = await this.context.executeTool(toolCall);
      return { ...result, preApproved: true };
    }

    // 4. Handle needs approval - prompt user
    const request = this.createApprovalRequest(toolCall);
    const decision = await this.controller.requestApproval(request);

    if (!decision.approved) {
      return this.createDeniedResult(toolCall, decision.note);
    }

    // 5. Execute the tool
    const result = await this.context.executeTool(toolCall);
    return { ...result };
  }

  /**
   * Execute multiple tool calls with approval checking.
   * Tools are processed sequentially to allow for approval prompts.
   */
  async executeTools(toolCalls: ToolCall[]): Promise<ApprovedExecuteResult[]> {
    const results: ApprovedExecuteResult[] = [];

    for (const toolCall of toolCalls) {
      const result = await this.executeTool(toolCall);
      results.push(result);
    }

    return results;
  }

  /**
   * Check if a tool call needs approval.
   */
  private checkApproval(toolCall: ToolCall): ApprovalResult {
    // If toolset implements SupportsNeedsApproval, use it
    if (this.toolset && supportsNeedsApproval(this.toolset)) {
      return this.toolset.needsApproval(toolCall.name, toolCall.arguments, undefined);
    }

    // Default: all tools need approval
    return ApprovalResult.needsApproval();
  }

  /**
   * Create an approval request for a tool call.
   */
  private createApprovalRequest(toolCall: ToolCall): ApprovalRequest {
    // If toolset provides custom description, use it
    if (this.toolset && supportsApprovalDescription(this.toolset)) {
      return {
        toolName: toolCall.name,
        toolArgs: toolCall.arguments,
        description: this.toolset.getApprovalDescription(toolCall.name, toolCall.arguments, undefined),
        securityContext: this.securityContext,
      };
    }

    // Default description
    return {
      toolName: toolCall.name,
      toolArgs: toolCall.arguments,
      description: `Execute tool: ${toolCall.name}`,
      securityContext: this.securityContext,
    };
  }

  /**
   * Create a blocked result.
   */
  private createBlockedResult(toolCall: ToolCall, reason: string): ApprovedExecuteResult {
    const error: ToolError = {
      type: "execution_failed",
      toolName: toolCall.name,
      message: `Tool blocked: ${reason}`,
    };
    return {
      success: false,
      toolCallId: toolCall.id,
      error,
      blocked: true,
    };
  }

  /**
   * Create a denied result.
   */
  private createDeniedResult(toolCall: ToolCall, note?: string): ApprovedExecuteResult {
    const error: ToolError = {
      type: "execution_failed",
      toolName: toolCall.name,
      message: note ? `Tool denied: ${note}` : "Tool execution denied by user",
    };
    return {
      success: false,
      toolCallId: toolCall.id,
      error,
      denied: true,
    };
  }
}

