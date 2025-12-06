/**
 * Worker Definition Schema
 *
 * Zod schemas for validating .worker file frontmatter.
 * Matches the Python WorkerDefinition structure.
 *
 * Note on optional arrays vs default([]):
 * - `.optional()` is used when undefined has semantic meaning (e.g., "no restriction")
 * - `.default([])` is used when we always want an array for easier iteration
 */

import { z } from "zod";

/**
 * Worker zone requirement - what this worker needs access to.
 */
export const WorkerZoneRequirementSchema = z.object({
  /** Name of the zone (must exist in project config) */
  name: z.string(),
  /** Access mode: ro (read-only) or rw (read-write). Default: rw */
  mode: z.enum(["ro", "rw"]).optional(),
});

export type WorkerZoneRequirement = z.infer<typeof WorkerZoneRequirementSchema>;

/**
 * Worker sandbox requirements - what zones this worker needs.
 *
 * Workers self-declare their sandbox needs. No sandbox declaration = pure function.
 */
export const WorkerSandboxConfigSchema = z.object({
  /** List of zones this worker needs access to */
  zones: z.array(WorkerZoneRequirementSchema).optional(),
});

export type WorkerSandboxConfig = z.infer<typeof WorkerSandboxConfigSchema>;

/**
 * Attachment policy
 */
export const AttachmentPolicySchema = z.object({
  max_attachments: z.number().nonnegative().default(4),
  max_total_bytes: z.number().positive().default(10_000_000),
  allowed_suffixes: z.array(z.string()).default([]),
  denied_suffixes: z.array(z.string()).default([]),
});

export type AttachmentPolicy = z.infer<typeof AttachmentPolicySchema>;

/**
 * Server-side tool configuration
 */
export const ServerSideToolConfigSchema = z.object({
  name: z.string(),
  config: z.record(z.unknown()).optional(),
});

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
 * Worker frontmatter configuration
 * This is what appears in the YAML section of a .worker file
 */
export const WorkerFrontmatterSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  model: z.string().optional(),
  /** If undefined, any model is compatible. Supports wildcards like "anthropic:*". */
  compatible_models: z.array(z.string()).optional(),
  output_schema_ref: z.string().optional(),
  sandbox: WorkerSandboxConfigSchema.optional(),
  toolsets: ToolsetsConfigSchema.optional(),
  attachment_policy: AttachmentPolicySchema.optional(),
  server_side_tools: z.array(ServerSideToolConfigSchema).default([]),
  locked: z.boolean().default(false),
});

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
