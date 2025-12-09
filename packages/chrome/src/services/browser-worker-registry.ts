/**
 * Browser Worker Registry
 *
 * Implements the core WorkerRegistry interface for browser environment.
 * Wraps the WorkerManager to provide the interface expected by WorkerCallToolset.
 */

import type { WorkerRegistry, WorkerLookupResult } from '@golem-forge/core';
import { workerManager } from './worker-manager';

/**
 * Browser implementation of WorkerRegistry.
 *
 * Adapts WorkerManager's async API to the WorkerRegistry interface
 * required by the portable worker-call toolset.
 */
export class BrowserWorkerRegistry implements WorkerRegistry {
  private sourceId: string;

  /**
   * Create a registry for a specific source.
   *
   * @param sourceId - The source ID (e.g., "bundled", or a GitHub source ID)
   */
  constructor(sourceId: string = 'bundled') {
    this.sourceId = sourceId;
  }

  /**
   * Look up a worker by name.
   *
   * Implementation note: In browser, we look up workers from the
   * current source (bundled or GitHub). The nameOrPath is the worker name.
   */
  async get(nameOrPath: string): Promise<WorkerLookupResult> {
    try {
      // Try to get the worker from the current source
      const definition = await workerManager.getWorker(this.sourceId, nameOrPath);

      return {
        found: true,
        worker: {
          filePath: `${this.sourceId}:${nameOrPath}`,
          definition,
        },
      };
    } catch (error) {
      // Worker not found in current source, try searching all sources
      try {
        const sources = await workerManager.getSources();

        for (const source of sources) {
          if (source.id === this.sourceId) continue; // Already tried

          try {
            const definition = await workerManager.getWorker(source.id, nameOrPath);
            return {
              found: true,
              worker: {
                filePath: `${source.id}:${nameOrPath}`,
                definition,
              },
            };
          } catch {
            // Not found in this source, continue
          }
        }
      } catch {
        // Error listing sources
      }

      const message = error instanceof Error ? error.message : String(error);
      return {
        found: false,
        error: `Worker '${nameOrPath}' not found: ${message}`,
      };
    }
  }
}

/**
 * Create a worker registry for a specific source.
 *
 * @param sourceId - Source ID (default: "bundled")
 */
export function createBrowserWorkerRegistry(sourceId: string = 'bundled'): WorkerRegistry {
  return new BrowserWorkerRegistry(sourceId);
}

/**
 * Singleton registry for bundled workers.
 * Most common use case for browser extension.
 */
export const bundledWorkerRegistry = new BrowserWorkerRegistry('bundled');
