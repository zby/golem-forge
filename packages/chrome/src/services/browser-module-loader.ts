/**
 * Browser Module Loader
 *
 * Custom module loading strategies for the browser extension.
 *
 * In a bundled environment (Chrome extension), dynamic import() works but
 * the modules must be:
 * 1. Pre-bundled with the extension, OR
 * 2. Loaded from a URL (with appropriate CORS headers)
 *
 * This module provides utilities for both approaches.
 */

import type { ModuleLoader } from '@golem-forge/core';

/**
 * Registry of pre-bundled custom tool modules.
 *
 * Extensions can register modules here at build time to make them
 * available for dynamic loading by name.
 *
 * @example
 * // At build time or extension initialization:
 * import * as myTools from './custom-tools';
 * bundledModules.set('my-tools', myTools);
 *
 * // At runtime:
 * const tools = await browserModuleLoader.load('my-tools');
 */
export const bundledModules = new Map<string, Record<string, unknown>>();

/**
 * Browser module loader using pre-registered modules.
 *
 * For modules registered in `bundledModules`, returns them directly.
 * For other paths, attempts dynamic import (which works for bundled chunks).
 */
export const browserModuleLoader: ModuleLoader = {
  async load(specifier: string): Promise<Record<string, unknown>> {
    // Check bundled modules first
    const bundled = bundledModules.get(specifier);
    if (bundled) {
      return bundled;
    }

    // Try to extract module name from path
    // e.g., "./tools.ts" -> "tools", "my-program/tools" -> "my-program/tools"
    const normalized = specifier
      .replace(/^\.\//, '')
      .replace(/\.(ts|js|mjs)$/, '');

    const bundledByName = bundledModules.get(normalized);
    if (bundledByName) {
      return bundledByName;
    }

    // Fall back to dynamic import
    // This works for:
    // - Modules bundled with the extension (if bundler supports it)
    // - Full URLs (https://...)
    try {
      return await import(/* @vite-ignore */ specifier);
    } catch (error) {
      // Provide helpful error message
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to load custom tools module '${specifier}'.\n` +
        `In browser, modules must be either:\n` +
        `  1. Pre-registered in bundledModules map\n` +
        `  2. Bundled with the extension and resolvable by the bundler\n` +
        `  3. A full URL to an ESM module\n\n` +
        `Original error: ${message}`
      );
    }
  },
};

/**
 * Create a module loader with additional pre-registered modules.
 *
 * @param additionalModules - Map of module specifiers to module exports
 * @returns A ModuleLoader that checks both bundled and additional modules
 */
export function createModuleLoader(
  additionalModules: Map<string, Record<string, unknown>>
): ModuleLoader {
  return {
    async load(specifier: string): Promise<Record<string, unknown>> {
      // Check additional modules first
      const additional = additionalModules.get(specifier);
      if (additional) {
        return additional;
      }

      // Fall back to browser module loader
      return browserModuleLoader.load(specifier);
    },
  };
}

/**
 * Register a module in the bundled modules map.
 *
 * Call this at extension initialization to make custom tools available.
 *
 * @example
 * // In extension initialization:
 * import * as calculatorTools from './tools/calculator-tools';
 * registerModule('calculator-tools', calculatorTools);
 *
 * // In worker config:
 * // custom:
 * //   module: calculator-tools
 * //   tools: [calculate, formatNumber]
 */
export function registerModule(name: string, module: Record<string, unknown>): void {
  bundledModules.set(name, module);
}

/**
 * Register multiple modules at once.
 *
 * @param modules - Object mapping names to module exports
 *
 * @example
 * registerModules({
 *   'calculator-tools': calculatorTools,
 *   'string-tools': stringTools,
 * });
 */
export function registerModules(modules: Record<string, Record<string, unknown>>): void {
  for (const [name, module] of Object.entries(modules)) {
    bundledModules.set(name, module);
  }
}
