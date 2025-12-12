/**
 * Mount-based Sandbox Types
 *
 * Docker-style bind mount model for sandboxing.
 * See docs/notes/sandbox-mount-model.md for design details.
 *
 * Type definitions are in @golem-forge/core; this file provides Zod schemas
 * for runtime validation.
 *
 * @module sandbox/mount-types
 */

import { z } from 'zod';

// Re-export all types from @golem-forge/core
export type {
  FileStat,
  FileOperations,
  Mount,
  MountSandboxConfig,
  SubWorkerRestriction,
  ResolvedMount,
  ResolvedMountConfig,
  MountSandbox,
} from '@golem-forge/core';

// ─────────────────────────────────────────────────────────────────────────────
// Zod Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const MountSchema = z.object({
  source: z.string().min(1),
  target: z.string().startsWith('/'),
  readonly: z.boolean().optional().default(false),
});

export const MountSandboxConfigSchema = z.object({
  root: z.string().min(1),
  readonly: z.boolean().optional().default(false),
  mounts: z.array(MountSchema).optional(),
});

export const SubWorkerRestrictionSchema = z.object({
  restrict: z.string().startsWith('/').optional(),
  readonly: z.boolean().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Types derived from schemas (for input validation)
// ─────────────────────────────────────────────────────────────────────────────

export type MountInput = z.input<typeof MountSchema>;
export type MountSandboxConfigInput = z.input<typeof MountSandboxConfigSchema>;
export type SubWorkerRestrictionInput = z.input<typeof SubWorkerRestrictionSchema>;
