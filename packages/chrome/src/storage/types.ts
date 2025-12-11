/**
 * Storage Types
 *
 * Data models for the browser extension storage layer.
 * Projects and worker references are stored in chrome.storage.local,
 * while file content is stored in OPFS.
 */

import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Worker Source Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A bundled worker source - workers included in the extension bundle.
 */
export const BundledWorkerSourceSchema = z.object({
  type: z.literal('bundled'),
  id: z.string(),
  name: z.string(),
});

export type BundledWorkerSource = z.infer<typeof BundledWorkerSourceSchema>;

/**
 * A GitHub worker source - workers fetched from a GitHub repository.
 */
export const GitHubWorkerSourceSchema = z.object({
  type: z.literal('github'),
  id: z.string(),
  repo: z.string(), // e.g., "owner/repo"
  branch: z.string().default('main'),
  path: z.string().default('workers'), // path to workers directory
  lastSync: z.number().optional(), // timestamp
});

export type GitHubWorkerSource = z.infer<typeof GitHubWorkerSourceSchema>;

/**
 * Union of all worker source types.
 */
export const WorkerSourceSchema = z.discriminatedUnion('type', [
  BundledWorkerSourceSchema,
  GitHubWorkerSourceSchema,
]);

export type WorkerSource = z.infer<typeof WorkerSourceSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Worker Reference
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reference to a worker within a source.
 */
export const WorkerRefSchema = z.object({
  /** Unique ID for this reference */
  id: z.string(),
  /** Source this worker comes from */
  sourceId: z.string(),
  /** Worker name (filename without .worker extension) */
  name: z.string(),
  /** Whether this worker is enabled for the program */
  enabled: z.boolean().default(true),
});

export type WorkerRef = z.infer<typeof WorkerRefSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Site Trigger
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A trigger that activates a worker on specific websites.
 */
export const SiteTriggerSchema = z.object({
  /** Unique ID */
  id: z.string(),
  /** URL pattern (supports * wildcards) */
  pattern: z.string(),
  /** Worker to trigger */
  workerId: z.string(),
  /** Whether this trigger is active */
  enabled: z.boolean().default(true),
  /** Trust level for this trigger */
  trustLevel: z.enum(['low', 'medium', 'high']).default('medium'),
});

export type SiteTrigger = z.infer<typeof SiteTriggerSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Program
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A Golem Forge program in the browser extension.
 *
 * A program is a runnable composition of workers - a directory with a main.worker
 * entry point and optional additional workers.
 */
export const ProgramSchema = z.object({
  /** Unique program ID */
  id: z.string(),
  /** Display name */
  name: z.string(),
  /** Optional description */
  description: z.string().optional(),
  /** GitHub repository (e.g., "owner/repo") if linked */
  githubRepo: z.string().optional(),
  /** GitHub branch */
  githubBranch: z.string().default('main'),
  /** Worker sources enabled for this program */
  workerSources: z.array(z.string()).default([]), // source IDs
  /** Site triggers for this program */
  triggers: z.array(SiteTriggerSchema).default([]),
  /** Creation timestamp */
  createdAt: z.number(),
  /** Last modified timestamp */
  updatedAt: z.number(),
});

export type Program = z.infer<typeof ProgramSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// API Key Storage
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Supported LLM providers.
 */
export const LLMProviderSchema = z.enum(['anthropic', 'openai', 'google', 'openrouter']);
export type LLMProvider = z.infer<typeof LLMProviderSchema>;

/**
 * API key configuration for a provider.
 */
export const APIKeyConfigSchema = z.object({
  provider: LLMProviderSchema,
  apiKey: z.string(),
  /** Whether this key has been validated */
  validated: z.boolean().default(false),
  /** Last validation timestamp */
  lastValidated: z.number().optional(),
});

export type APIKeyConfig = z.infer<typeof APIKeyConfigSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Extension Settings
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Global extension settings.
 */
export const ExtensionSettingsSchema = z.object({
  /** Default LLM provider */
  defaultProvider: LLMProviderSchema.default('anthropic'),
  /** Default model for the default provider */
  defaultModel: z.string().default('claude-sonnet-4-20250514'),
  /** Whether to show approval dialogs */
  showApprovals: z.boolean().default(true),
  /** Maximum iterations per worker run */
  maxIterations: z.number().default(50),
});

export type ExtensionSettings = z.infer<typeof ExtensionSettingsSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Storage Keys
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Keys used in chrome.storage.local
 *
 * Note: The underlying storage keys remain 'projects' for BACKCOMPAT
 * with existing chrome.storage data, but the constant is named PROGRAMS to match
 * the Program terminology.
 */
export const STORAGE_KEYS = {
  PROGRAMS: 'projects', // BACKCOMPAT: persisted key remains 'projects'
  WORKER_SOURCES: 'workerSources',
  API_KEYS: 'apiKeys',
  SETTINGS: 'settings',
  GITHUB_TOKEN: 'githubToken',
} as const;
