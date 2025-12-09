/**
 * Base Tool Types
 *
 * Platform-agnostic interfaces for tools and toolsets.
 */

import type { Tool } from "ai";
import type { FileOperations } from "../sandbox-types.js";
import type { ApprovalController } from "../approval/index.js";

/**
 * Execution mode for tools.
 *
 * - `llm`: Tool can only be invoked by the LLM (default, current behavior)
 * - `manual`: Tool can only be invoked by the user
 * - `both`: Tool can be invoked by either LLM or user
 */
export type ExecutionMode = "llm" | "manual" | "both";

/**
 * Tool-level configuration for manual execution.
 * Enables user-invokable tools in the UI.
 */
export interface ManualExecutionConfig {
  /** Execution mode for this tool */
  mode: ExecutionMode;
  /** Human-readable label (defaults to tool name) */
  label?: string;
  /** Category for grouping in UI (e.g., "Git Operations") */
  category?: string;
}

/**
 * A tool with a name property for registration.
 * Uses the AI SDK Tool type with a required name.
 * We use `any` for the generic parameters to allow collecting tools
 * with different input types into arrays, following the AI SDK's ToolSet pattern.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NamedTool = Tool<any, any> & {
  /** Unique name for this tool (used for registration and invocation) */
  name: string;
  /** Configuration for manual tool execution (user-invoked) */
  manualExecution?: ManualExecutionConfig;
};

/**
 * Base interface for toolsets.
 * Toolsets are collections of related tools.
 */
export interface Toolset {
  /** Get all tools in this toolset */
  getTools(): NamedTool[];
}

/**
 * Context provided to toolset factories.
 * Contains platform-provided dependencies that tools may need.
 */
export interface ToolsetContext {
  /** Sandbox for file operations. Undefined if worker has no sandbox. */
  sandbox?: FileOperations;
  /** Approval controller for tools requiring approval. */
  approvalController: ApprovalController;
  /** Path to the worker file (for resolving relative paths). */
  workerFilePath?: string;
  /** Program root directory. */
  programRoot?: string;
  /** Toolset-specific configuration from worker YAML. */
  config: Record<string, unknown>;
}

/**
 * Factory function that creates tools for a toolset.
 * Receives context with sandbox, approval controller, and config.
 * Returns array of NamedTool objects.
 */
export type ToolsetFactory = (ctx: ToolsetContext) => Promise<NamedTool[]> | NamedTool[];
