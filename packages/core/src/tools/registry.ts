/**
 * Toolset Registry
 *
 * Provides plugin-style registration for toolsets.
 * Toolsets self-register when their module is imported.
 * Worker runtime looks up factories by name.
 */

import type { ToolsetFactory } from "./base.js";

/**
 * Registry for toolset factories.
 * Toolsets self-register; worker runtime looks up by name.
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
