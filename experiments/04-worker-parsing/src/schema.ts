/**
 * Worker Definition Schema
 *
 * Zod schemas for validating .worker file frontmatter.
 * Matches the Python WorkerDefinition structure.
 */

import { z } from "zod";

/**
 * Sandbox path configuration
 */
export const SandboxPathSchema = z.object({
  root: z.string(),
  mode: z.enum(["ro", "rw"]).default("ro"),
  suffixes: z.array(z.string()).optional(),
  max_file_bytes: z.number().positive().optional(),
  write_approval: z.boolean().optional(),
});

export type SandboxPath = z.infer<typeof SandboxPathSchema>;

/**
 * Sandbox configuration
 */
export const SandboxConfigSchema = z.object({
  paths: z.record(z.string(), SandboxPathSchema).optional(),
});

export type SandboxConfig = z.infer<typeof SandboxConfigSchema>;

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
  compatible_models: z.array(z.string()).optional(),
  output_schema_ref: z.string().optional(),
  sandbox: SandboxConfigSchema.optional(),
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
