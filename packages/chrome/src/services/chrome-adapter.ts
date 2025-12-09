/**
 * Chrome Adapter
 *
 * Bridges the BrowserWorkerRuntime to the UIEventBus.
 * Provides event-driven communication between the runtime and UI.
 *
 * @module @golem-forge/chrome/services/chrome-adapter
 */

import {
  BaseUIImplementation,
  type UIEventBus,
  createRuntimeUI,
  type RuntimeUI,
} from '@golem-forge/core';
import { createBrowserRuntime, type BrowserWorkerRuntime } from './browser-runtime.js';
import type { WorkerDefinition } from './worker-manager.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Options for the ChromeAdapter.
 */
export interface ChromeAdapterOptions {
  /** Program ID for sandbox access */
  programId?: string;
  /** Model ID (e.g., "anthropic:claude-sonnet-4-20250514") */
  modelId?: string;
  /** Maximum iterations per run */
  maxIterations?: number;
}

/**
 * State of the current worker execution.
 */
export interface WorkerExecutionState {
  /** Whether a worker is currently running */
  isRunning: boolean;
  /** The current worker being executed */
  worker?: WorkerDefinition;
  /** The runtime instance */
  runtime?: BrowserWorkerRuntime;
}

// ============================================================================
// ChromeAdapter
// ============================================================================

/**
 * ChromeAdapter bridges BrowserWorkerRuntime to the UIEventBus.
 *
 * This adapter:
 * - Creates a RuntimeUI instance for event-based communication
 * - Manages worker execution lifecycle
 * - Emits events for streaming, tool calls, and approval requests
 *
 * @example
 * ```typescript
 * import { createUIEventBus } from '@golem-forge/core';
 * import { UIProvider } from '@golem-forge/ui-react';
 * import { ChromeAdapter } from './services/chrome-adapter';
 *
 * const eventBus = createUIEventBus();
 * const adapter = new ChromeAdapter(eventBus, { programId: 'my-program' });
 *
 * // In React
 * function App() {
 *   return (
 *     <UIProvider bus={eventBus}>
 *       <ChatUI onSubmit={(input) => adapter.runWorker(worker, input)} />
 *     </UIProvider>
 *   );
 * }
 * ```
 */
export class ChromeAdapter extends BaseUIImplementation {
  private runtimeUI: RuntimeUI;
  private options: ChromeAdapterOptions;
  private state: WorkerExecutionState = { isRunning: false };

  constructor(bus: UIEventBus, options: ChromeAdapterOptions = {}) {
    super(bus);
    this.runtimeUI = createRuntimeUI(bus);
    this.options = options;
  }

  /**
   * Initialize the adapter.
   * ChromeAdapter is stateless - no initialization needed.
   * Event subscriptions are handled by UIProvider in React.
   */
  async initialize(): Promise<void> {
    // Nothing to initialize - ChromeAdapter is stateless
    // Display event subscriptions are handled by UIProvider
  }

  /**
   * Shutdown the adapter.
   * Nothing to clean up since we don't manage subscriptions.
   */
  async shutdown(): Promise<void> {
    // Nothing to clean up
  }

  /**
   * Update the adapter options.
   * Useful when program/model selection changes.
   */
  updateOptions(options: Partial<ChromeAdapterOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get current execution state.
   */
  getState(): WorkerExecutionState {
    return { ...this.state };
  }

  /**
   * Check if a worker is currently running.
   */
  isRunning(): boolean {
    return this.state.isRunning;
  }

  /**
   * Run a worker with the given input.
   * Emits events to the bus for UI consumption.
   *
   * @param worker - The worker definition to execute
   * @param input - The user input/prompt
   * @returns The worker execution result
   * @throws Error if a worker is already running
   */
  async runWorker(
    worker: WorkerDefinition,
    input: string
  ): Promise<{ success: boolean; response?: string; error?: string }> {
    if (this.state.isRunning) {
      throw new Error('A worker is already running. Wait for it to complete or interrupt it.');
    }

    this.state = { isRunning: true, worker };

    try {
      // Show user message via event bus
      this.runtimeUI.showMessage({ role: 'user', content: input });

      // Create runtime with event-based mode
      const runtime = await createBrowserRuntime({
        worker,
        programId: this.options.programId,
        modelId: this.options.modelId,
        maxIterations: this.options.maxIterations,
        runtimeUI: this.runtimeUI, // Event-based mode
      });

      this.state.runtime = runtime;

      // Run the worker
      const result = await runtime.run(input);

      // Show final assistant message if successful
      if (result.success && result.response) {
        this.runtimeUI.showMessage({ role: 'assistant', content: result.response });
      }

      // Show error status if failed
      if (!result.success && result.error) {
        this.runtimeUI.showStatus('error', result.error);
      }

      return {
        success: result.success,
        response: result.response,
        error: result.error,
      };
    } finally {
      this.state = { isRunning: false };
    }
  }

  /**
   * Get the RuntimeUI instance.
   * Useful for advanced use cases that need direct access.
   */
  getRuntimeUI(): RuntimeUI {
    return this.runtimeUI;
  }
}

/**
 * Create a ChromeAdapter instance.
 *
 * @param bus - The UIEventBus for communication
 * @param options - Optional configuration
 * @returns A new ChromeAdapter instance
 */
export function createChromeAdapter(
  bus: UIEventBus,
  options?: ChromeAdapterOptions
): ChromeAdapter {
  return new ChromeAdapter(bus, options);
}
