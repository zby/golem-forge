/**
 * Custom Tools Loader
 *
 * Platform-agnostic custom tool loading from ES modules.
 * Works in both Node.js (CLI) and browser (Chrome extension with bundled modules).
 *
 * Supports two export formats:
 * 1. Function + Schema: export function foo(args) + export const fooSchema = z.object(...)
 * 2. Full Tool Object: export const foo: NamedTool = { name, inputSchema, execute, ... }
 *
 * Tools without needsApproval get wrapped with config-based defaults.
 *
 * Note on browser usage:
 * - In bundled environments (Chrome extension), modules must be bundled with the extension
 * - Dynamic import() works but the module specifier must be resolvable by the bundler
 * - For runtime-loaded modules, a custom ModuleLoader can be provided
 */

import { z } from 'zod';
import type { ToolExecutionOptions } from 'ai';
import type { NamedTool, ToolsetContext } from './base.js';
import type { FileOperations } from '../sandbox-types.js';
import { ToolsetRegistry } from './registry.js';

/**
 * Approval decision for custom tools.
 */
type ApprovalDecisionType = 'preApproved' | 'ask' | 'blocked';

// ============================================================================
// Types
// ============================================================================

/**
 * Context passed to custom tool functions as second argument.
 * Provides access to sandbox and execution metadata.
 */
export interface ToolContext {
  /** Sandbox for file operations. Undefined if worker has no sandbox. */
  sandbox?: FileOperations;
  /** Unique ID for this tool call */
  toolCallId: string;
}

/**
 * Approval configuration for custom tools.
 */
export interface CustomApprovalConfig {
  /** Default approval for tools without specific config. Default: 'ask' */
  default?: ApprovalDecisionType;
  /** Per-tool approval overrides */
  tools?: Record<string, ApprovalDecisionType>;
}

/**
 * Configuration for the custom toolset in worker YAML.
 */
export interface CustomToolsetConfig {
  /** Path to the tools module, relative to worker file */
  module: string;
  /** Whitelist of tool names to expose */
  tools: string[];
  /** Approval configuration */
  approval?: CustomApprovalConfig;
}

/**
 * Schema for validating custom toolset config from YAML.
 */
export const CustomToolsetConfigSchema = z.object({
  module: z.string(),
  tools: z.array(z.string()).min(1),
  approval: z.object({
    default: z.enum(['preApproved', 'ask', 'blocked']).optional(),
    tools: z.record(z.enum(['preApproved', 'ask', 'blocked'])).optional(),
  }).optional(),
});

/**
 * Module loader interface for custom module resolution.
 * Allows platforms to provide custom loading strategies.
 */
export interface ModuleLoader {
  /**
   * Load a module by specifier.
   * @param specifier - Module path or URL
   * @returns The module's exports
   */
  load(specifier: string): Promise<Record<string, unknown>>;
}

/**
 * Default module loader using dynamic import.
 * Works in both Node.js and browser ESM environments.
 */
export const defaultModuleLoader: ModuleLoader = {
  async load(specifier: string): Promise<Record<string, unknown>> {
    return import(specifier);
  },
};

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if an export is a NamedTool object.
 */
export function isNamedTool(obj: unknown): obj is NamedTool {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const candidate = obj as Record<string, unknown>;

  return (
    typeof candidate.name === 'string' &&
    candidate.inputSchema !== undefined &&
    typeof candidate.execute === 'function'
  );
}

/**
 * Check if an object is a Zod schema (z.object).
 */
export function isZodSchema(obj: unknown): obj is z.ZodType {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  // Zod schemas have a _def property and parse/safeParse methods
  const candidate = obj as Record<string, unknown>;
  return (
    candidate._def !== undefined &&
    typeof candidate.parse === 'function' &&
    typeof candidate.safeParse === 'function'
  );
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Extract description from a function's JSDoc comment or toString().
 * Returns undefined if no description found.
 */
export function extractFunctionDescription(fn: (...args: unknown[]) => unknown): string | undefined {
  // Try to get description from function's toString()
  // This is limited - JSDoc comments are typically stripped at compile time
  const fnStr = fn.toString();

  // Look for a leading comment block
  const commentMatch = fnStr.match(/^\/\*\*([\s\S]*?)\*\//);
  if (commentMatch) {
    // Extract first line of JSDoc
    const lines = commentMatch[1].split('\n');
    for (const line of lines) {
      const trimmed = line.replace(/^\s*\*\s*/, '').trim();
      if (trimmed && !trimmed.startsWith('@')) {
        return trimmed;
      }
    }
  }

  return undefined;
}

/**
 * Wrap a tool with default approval based on config.
 * Respects tool's own needsApproval if defined.
 */
export function wrapWithDefaultApproval(
  tool: NamedTool,
  approvalConfig?: CustomApprovalConfig
): NamedTool {
  // If tool already has needsApproval, respect it
  if (tool.needsApproval !== undefined) {
    return tool;
  }

  // Apply config-based default
  const toolApproval =
    approvalConfig?.tools?.[tool.name] ??
    approvalConfig?.default ??
    'ask'; // Secure default

  return {
    ...tool,
    needsApproval: toolApproval !== 'preApproved',
  };
}

/**
 * Create a NamedTool from a function and its schema.
 *
 * @param name - Tool name
 * @param fn - The tool function (args, context?) => result
 * @param schema - Zod schema for input validation
 * @param sandbox - Optional sandbox for file operations
 * @param description - Optional description override
 */
export function createToolFromFunction(
  name: string,
  fn: (...args: unknown[]) => unknown,
  schema: z.ZodType,
  sandbox?: FileOperations,
  description?: string
): NamedTool {
  return {
    name,
    description: description || extractFunctionDescription(fn) || `Custom tool: ${name}`,
    inputSchema: schema,
    execute: async (args: unknown, options: ToolExecutionOptions) => {
      // Build context for the tool function
      const context: ToolContext = {
        sandbox,
        toolCallId: options.toolCallId,
      };

      // Support both sync and async functions
      // Pass context as second argument - tools can ignore it if not needed
      const result = fn(args, context);
      if (result instanceof Promise) {
        return await result;
      }
      return result;
    },
  };
}

// ============================================================================
// Loader
// ============================================================================

/**
 * Options for loading custom tools.
 */
export interface LoadCustomToolsOptions {
  /** Module path or specifier */
  modulePath: string;
  /** Custom toolset configuration */
  config: CustomToolsetConfig;
  /** Optional sandbox for file operations */
  sandbox?: FileOperations;
  /** Optional custom module loader */
  moduleLoader?: ModuleLoader;
}

/**
 * Load custom tools from a module.
 *
 * @param options - Loading options
 * @returns Array of NamedTool objects
 */
export async function loadCustomTools(
  options: LoadCustomToolsOptions
): Promise<NamedTool[]>;

/**
 * Load custom tools from a module (legacy signature).
 *
 * @param modulePath - Absolute path to the tools module
 * @param config - Custom toolset configuration
 * @param sandbox - Optional sandbox for file operations
 * @returns Array of NamedTool objects
 */
export async function loadCustomTools(
  modulePath: string,
  config: CustomToolsetConfig,
  sandbox?: FileOperations
): Promise<NamedTool[]>;

/**
 * Implementation of loadCustomTools supporting both signatures.
 */
export async function loadCustomTools(
  optionsOrPath: LoadCustomToolsOptions | string,
  config?: CustomToolsetConfig,
  sandbox?: FileOperations
): Promise<NamedTool[]> {
  // Normalize arguments
  let modulePath: string;
  let toolConfig: CustomToolsetConfig;
  let toolSandbox: FileOperations | undefined;
  let loader: ModuleLoader;

  if (typeof optionsOrPath === 'string') {
    // Legacy signature
    modulePath = optionsOrPath;
    toolConfig = config!;
    toolSandbox = sandbox;
    loader = defaultModuleLoader;
  } else {
    // New options signature
    modulePath = optionsOrPath.modulePath;
    toolConfig = optionsOrPath.config;
    toolSandbox = optionsOrPath.sandbox;
    loader = optionsOrPath.moduleLoader ?? defaultModuleLoader;
  }

  // Dynamic import the module
  let module: Record<string, unknown>;
  try {
    module = await loader.load(modulePath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load custom tools from ${modulePath}: ${message}`);
  }

  const tools: NamedTool[] = [];

  for (const toolName of toolConfig.tools) {
    const exported = module[toolName];

    if (exported === undefined) {
      throw new Error(
        `Tool '${toolName}' not found in ${modulePath}. ` +
        `Available exports: ${Object.keys(module).join(', ')}`
      );
    }

    // Format 2: Full NamedTool object
    if (isNamedTool(exported)) {
      tools.push(wrapWithDefaultApproval(exported, toolConfig.approval));
      continue;
    }

    // Format 1: Function + Schema
    if (typeof exported === 'function') {
      const schemaName = `${toolName}Schema`;
      const schema = module[schemaName];

      if (!schema) {
        throw new Error(
          `Schema '${schemaName}' not found for function '${toolName}' in ${modulePath}. ` +
          `When exporting a plain function, you must also export a matching Zod schema.`
        );
      }

      if (!isZodSchema(schema)) {
        throw new Error(
          `Export '${schemaName}' is not a valid Zod schema. ` +
          `Expected z.object({...}), got ${typeof schema}.`
        );
      }

      const tool = createToolFromFunction(toolName, exported as (...args: unknown[]) => unknown, schema, toolSandbox);
      tools.push(wrapWithDefaultApproval(tool, toolConfig.approval));
      continue;
    }

    throw new Error(
      `Export '${toolName}' in ${modulePath} must be either:\n` +
      `  1. A function (with matching '${toolName}Schema' export)\n` +
      `  2. A NamedTool object with { name, inputSchema, execute }`
    );
  }

  return tools;
}

// ============================================================================
// Toolset Class
// ============================================================================

/**
 * Options for creating a CustomToolset.
 */
export interface CustomToolsetOptions {
  /** Absolute path to the tools module */
  modulePath: string;
  /** Custom toolset configuration */
  config: CustomToolsetConfig;
  /** Optional sandbox for file operations */
  sandbox?: FileOperations;
  /** Optional custom module loader */
  moduleLoader?: ModuleLoader;
}

/**
 * Toolset that loads custom tools from a tools.ts module.
 */
export class CustomToolset {
  private tools: NamedTool[] = [];
  private loaded = false;

  constructor(private options: CustomToolsetOptions) {}

  /**
   * Load tools from the module. Must be called before getTools().
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    this.tools = await loadCustomTools({
      modulePath: this.options.modulePath,
      config: this.options.config,
      sandbox: this.options.sandbox,
      moduleLoader: this.options.moduleLoader,
    });
    this.loaded = true;
  }

  /**
   * Get all custom tools. Throws if not loaded.
   */
  getTools(): NamedTool[] {
    if (!this.loaded) {
      throw new Error('CustomToolset not loaded. Call load() first.');
    }
    return this.tools;
  }
}

/**
 * Factory function to create and load a CustomToolset.
 */
export async function createCustomToolset(
  options: CustomToolsetOptions
): Promise<CustomToolset> {
  const toolset = new CustomToolset(options);
  await toolset.load();
  return toolset;
}

/**
 * Factory function for ToolsetRegistry.
 * Creates custom tools from context.
 *
 * Required context.config fields:
 * - module: string - path to the tools module
 * - tools: string[] - list of tool names to expose
 * - approval?: CustomApprovalConfig - approval configuration
 * - moduleLoader?: ModuleLoader - custom module loader (optional)
 * - workerFilePath?: string - for resolving relative module paths
 */
export async function customToolsetFactory(ctx: ToolsetContext): Promise<NamedTool[]> {
  const config = ctx.config as unknown as CustomToolsetConfig & {
    moduleLoader?: ModuleLoader;
  };

  if (!config.module) {
    throw new Error('Custom toolset requires a "module" path in config');
  }

  if (!config.tools || config.tools.length === 0) {
    return [];
  }

  // Resolve module path relative to worker file if needed
  let modulePath = config.module;
  if (ctx.workerFilePath && !modulePath.startsWith('/') && !modulePath.startsWith('file://')) {
    // For relative paths, we need platform-specific resolution
    // In CLI, this would be path.resolve(path.dirname(workerFilePath), modulePath)
    // In browser, the module should be pre-bundled or use import maps
    // For now, we pass through and let the module loader handle it
  }

  return loadCustomTools({
    modulePath,
    config: {
      module: config.module,
      tools: config.tools,
      approval: config.approval,
    },
    sandbox: ctx.sandbox,
    moduleLoader: config.moduleLoader,
  });
}

// Self-register with ToolsetRegistry
ToolsetRegistry.register('custom', customToolsetFactory);
