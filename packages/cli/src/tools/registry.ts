/**
 * Toolset Registry
 *
 * Provides plugin-style registration for toolsets.
 * Toolsets self-register when their module is imported.
 * Worker runtime looks up factories by name.
 */

import type { NamedTool } from './filesystem.js';
import type { FileOperations } from '../sandbox/index.js';
import type { ApprovalController } from '../approval/index.js';

/**
 * Context passed to toolset factories during registration.
 * Provides access to sandbox, approval controller, and configuration.
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

/**
 * Registry for toolset factories.
 * Toolsets self-register; worker.ts looks up by name.
 */
class ToolsetRegistryImpl {
  private factories = new Map<string, ToolsetFactory>();

  /**
   * Register a toolset factory.
   * @param name - Unique toolset name (e.g., 'filesystem', 'git')
   * @param factory - Factory function that creates tools
   * @throws If toolset with same name is already registered
   */
  register(name: string, factory: ToolsetFactory): void {
    if (this.factories.has(name)) {
      throw new Error(`Toolset "${name}" already registered`);
    }
    this.factories.set(name, factory);
  }

  /**
   * Get a toolset factory by name.
   * @param name - Toolset name
   * @returns Factory function or undefined if not found
   */
  get(name: string): ToolsetFactory | undefined {
    return this.factories.get(name);
  }

  /**
   * Check if a toolset is registered.
   * @param name - Toolset name
   */
  has(name: string): boolean {
    return this.factories.has(name);
  }

  /**
   * List all registered toolset names.
   */
  list(): string[] {
    return Array.from(this.factories.keys());
  }

  /**
   * Clear all registrations (for testing).
   */
  clear(): void {
    this.factories.clear();
  }
}

/**
 * Global toolset registry.
 * Toolsets self-register on module import.
 */
export const ToolsetRegistry = new ToolsetRegistryImpl();
