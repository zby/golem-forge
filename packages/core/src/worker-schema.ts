/**
 * Worker Definition Schema
 *
 * Zod schemas for validating .worker file frontmatter.
 * Platform-agnostic - used by both CLI and browser extension.
 *
 * Note on optional arrays vs default([]):
 * - `.optional()` is used when undefined has semantic meaning (e.g., "no restriction")
 * - `.default([])` is used when we always want an array for easier iteration
 *
 * @module @golem-forge/core/worker-schema
 */

import { z } from 'zod';

/**
 * Approval decision type for operations.
 * - 'preApproved': No user prompt needed
 * - 'ask': Prompt user for approval (default)
 * - 'blocked': Operation blocked entirely
 */
export const ApprovalDecisionTypeSchema = z.enum(['preApproved', 'ask', 'blocked']);

export type ApprovalDecisionType = z.infer<typeof ApprovalDecisionTypeSchema>;

/**
 * Per-path approval configuration.
 * Separate from mode (capability) - this controls consent/UX.
 */
export const PathApprovalConfigSchema = z.object({
  /** Approval for write operations. Default: 'ask' */
  write: ApprovalDecisionTypeSchema.optional(),
  /** Approval for delete operations. Default: 'ask' */
  delete: ApprovalDecisionTypeSchema.optional(),
}).strict();

export type PathApprovalConfig = z.infer<typeof PathApprovalConfigSchema>;

/**
 * Worker sandbox restriction - how to restrict parent's sandbox for this worker.
 *
 * Workers can declare sandbox restrictions that will be applied when called
 * as a sub-worker. If no sandbox config, worker gets full parent sandbox access.
 */
export const WorkerSandboxConfigSchema = z.object({
  /** Restrict to subtree (e.g., "/src"). Omit for full access. */
  restrict: z.string().startsWith('/').optional(),
  /** Make read-only. Default: inherit from parent */
  readonly: z.boolean().optional(),
  /** Approval config - consent layer (optional, defaults to 'ask' for write ops) */
  approval: PathApprovalConfigSchema.optional(),
}).strict();

export type WorkerSandboxConfig = z.infer<typeof WorkerSandboxConfigSchema>;

/**
 * Attachment policy
 */
export const AttachmentPolicySchema = z.object({
  max_attachments: z.number().nonnegative().default(4),
  max_total_bytes: z.number().positive().default(10_000_000),
  allowed_suffixes: z.array(z.string()).default([]),
  denied_suffixes: z.array(z.string()).default([]),
}).strict();

export type AttachmentPolicy = z.infer<typeof AttachmentPolicySchema>;

/**
 * Server-side tool configuration
 */
export const ServerSideToolConfigSchema = z.object({
  name: z.string(),
  config: z.record(z.unknown()).optional(),
}).strict();

export type ServerSideToolConfig = z.infer<typeof ServerSideToolConfigSchema>;

/**
 * Toolset configuration - maps toolset names/aliases to their configs
 */
export const ToolsetsConfigSchema = z.record(
  z.string(),
  z.record(z.unknown()).optional().default({})
);

export type ToolsetsConfig = z.infer<typeof ToolsetsConfigSchema>;

/**
 * Worker execution mode.
 * - 'single': Run once and complete (default)
 * - 'chat': Interactive chat loop - waits for user input between LLM turns
 */
export const WorkerModeSchema = z.enum(['single', 'chat']);

export type WorkerMode = z.infer<typeof WorkerModeSchema>;

/**
 * Worker frontmatter configuration
 * This is what appears in the YAML section of a .worker file
 */
export const WorkerFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  /**
   * Execution mode. Default: 'single' (run once and complete).
   * Use 'chat' for interactive multi-turn conversations.
   */
  mode: WorkerModeSchema.default('single'),
  /**
   * Model compatibility constraints. Supports wildcards like "anthropic:*".
   * If undefined, any model is compatible.
   * To require a specific model, use a single exact entry: ["anthropic:claude-sonnet-4"]
   */
  compatible_models: z.array(z.string()).optional(),
  output_schema_ref: z.string().optional(),
  sandbox: WorkerSandboxConfigSchema.optional(),
  toolsets: ToolsetsConfigSchema.optional(),
  attachment_policy: AttachmentPolicySchema.optional(),
  /**
   * Whether this worker can be invoked with no text input.
   * Default false: CLI will error if no input/attachments are provided,
   * even when a sandbox is available, unless this is set true.
   */
  allow_empty_input: z.boolean().default(false),
  server_side_tools: z.array(ServerSideToolConfigSchema).default([]),
  locked: z.boolean().default(false),
  /**
   * Maximum context tokens for chat mode. Default: 8000.
   * When exceeded, user is warned and can use /new to reset.
   */
  max_context_tokens: z.number().positive().default(8000),
}).strict();

export type WorkerFrontmatter = z.infer<typeof WorkerFrontmatterSchema>;

/**
 * Complete worker definition including parsed instructions
 */
export const WorkerDefinitionSchema = WorkerFrontmatterSchema.extend({
  instructions: z.string(),
});

export type WorkerDefinition = z.infer<typeof WorkerDefinitionSchema>;

/**
 * Result of parsing a .worker file
 */
export interface ParseResult {
  success: true;
  worker: WorkerDefinition;
}

export interface ParseError {
  success: false;
  error: string;
  details?: z.ZodError;
}

export type ParseWorkerResult = ParseResult | ParseError;

/**
 * Format a parse error for display.
 */
export function formatParseError(result: ParseWorkerResult): string {
  if (result.success) {
    return 'No error';
  }

  let message = result.error;

  if (result.details) {
    const issues = result.details.issues.map((issue) => {
      const path = issue.path.join('.');
      return `  - ${path ? `${path}: ` : ''}${issue.message}`;
    });
    message += '\n' + issues.join('\n');
  }

  return message;
}

/**
 * Check if a worker definition requires sandbox features.
 *
 * A worker needs sandbox if it declares:
 * - `sandbox` configuration (restrictions on sandbox access)
 * - `toolsets.filesystem` (filesystem tools)
 * - `toolsets.git` (git tools operate on sandbox)
 *
 * @param worker - Worker definition to check
 * @returns true if the worker requires sandbox features
 */
export function workerNeedsSandbox(worker: WorkerDefinition): boolean {
  return (
    !!worker.sandbox ||
    !!worker.toolsets?.filesystem ||
    !!worker.toolsets?.git
  );
}
