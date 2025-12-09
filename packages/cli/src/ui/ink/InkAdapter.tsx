/**
 * Ink-based UIImplementation
 *
 * Renders a rich terminal UI using Ink (React for CLI).
 * Uses React contexts from @golem-forge/ui-react for state management.
 */

import React, { useEffect, useRef } from "react";
import { render } from "ink";
import {
  BaseUIImplementation,
  type UIEventBus,
  type Unsubscribe,
} from "@golem-forge/core";
import {
  useMessagesActions,
  useApprovalActions,
  useWorkerActions,
  useUIStateActions,
} from "@golem-forge/ui-react";
import { useInkUIStateActions } from "./contexts/InkUIStateContext.js";
import { App } from "./components/App.js";

// ============================================================================
// Types
// ============================================================================

export interface InkAdapterOptions {
  /** Current working directory for footer display */
  cwd?: string;
  /** Git branch for footer display */
  branch?: string;
  /** Show header */
  showHeader?: boolean;
  /** Show footer */
  showFooter?: boolean;
}

/**
 * Bridge interface for accessing React context actions from outside React
 */
interface ContextActions {
  messages: ReturnType<typeof useMessagesActions>;
  approval: ReturnType<typeof useApprovalActions>;
  workers: ReturnType<typeof useWorkerActions>;
  ui: ReturnType<typeof useUIStateActions>;
  inkUI: ReturnType<typeof useInkUIStateActions>;
}

// ============================================================================
// Controller Bridge Component
// ============================================================================

/**
 * Bridge component that exposes context actions to the adapter
 */
interface ControllerBridgeProps {
  onReady: (actions: ContextActions) => void;
}

function ControllerBridge({ onReady }: ControllerBridgeProps): null {
  const messages = useMessagesActions();
  const approval = useApprovalActions();
  const workers = useWorkerActions();
  const ui = useUIStateActions();
  const inkUI = useInkUIStateActions();

  const actionsRef = useRef<ContextActions | null>(null);

  useEffect(() => {
    const actions = { messages, approval, workers, ui, inkUI };
    actionsRef.current = actions;
    onReady(actions);
  }, [messages, approval, workers, ui, inkUI, onReady]);

  return null;
}

/**
 * App wrapper that includes the controller bridge
 */
interface AppWithBridgeProps {
  bus: UIEventBus;
  onReady: (actions: ContextActions) => void;
  options: InkAdapterOptions;
}

function AppWithBridge({
  bus,
  onReady,
  options,
}: AppWithBridgeProps): React.ReactElement {
  return (
    <App
      bus={bus}
      cwd={options.cwd}
      branch={options.branch}
      showHeader={options.showHeader}
      showFooter={options.showFooter}
    >
      <ControllerBridge onReady={onReady} />
    </App>
  );
}

// ============================================================================
// InkAdapter Class
// ============================================================================

/**
 * Ink-based implementation of UIImplementation.
 *
 * This adapter:
 * - Renders a rich terminal UI using Ink (React for CLI)
 * - Uses UIProvider from @golem-forge/ui-react for automatic event subscriptions
 * - Provides a bridge to access context actions from outside React
 */
export class InkAdapter extends BaseUIImplementation {
  private actions?: ContextActions;
  private instance?: ReturnType<typeof render>;
  private options: InkAdapterOptions;
  private initialized = false;
  private subscriptions: Unsubscribe[] = [];
  private sigintHandler?: () => void;
  private sessionEnded = false;
  private sessionEndResolve?: () => void;

  constructor(bus: UIEventBus, options: InkAdapterOptions = {}) {
    super(bus);
    this.options = {
      showHeader: true,
      showFooter: true,
      ...options,
    };
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    return new Promise((resolve) => {
      this.instance = render(
        <AppWithBridge
          bus={this.bus}
          options={this.options}
          onReady={(actions) => {
            this.actions = actions;
            this.subscribeToEvents();
            this.initialized = true;
            resolve();
          }}
        />
      );

      // Set up SIGINT handler for graceful shutdown
      this.sigintHandler = () => {
        this.sendInterrupt("User interrupted");
      };
      process.on("SIGINT", this.sigintHandler);
    });
  }

  private subscribeToEvents(): void {
    // Subscribe to input prompt events from runtime
    this.subscriptions.push(
      this.bus.on("inputPrompt", (event) => {
        this.actions!.inkUI.setInputPrompt(event.requestId, event.prompt);
        this.actions!.ui.setMode("input");
      })
    );

    // Subscribe to context usage events from runtime (chat mode)
    this.subscriptions.push(
      this.bus.on("contextUsage", (event) => {
        // Convert tokens to percentage
        const percentage = event.tokenLimit > 0
          ? Math.round((event.tokensUsed / event.tokenLimit) * 100)
          : 0;
        this.actions!.inkUI.setContextUsage(percentage);
      })
    );

    // Subscribe to sessionEnd to know when the worker is done
    this.subscriptions.push(
      this.bus.on("sessionEnd", () => {
        this.sessionEnded = true;
        if (this.sessionEndResolve) {
          this.sessionEndResolve();
        }
      })
    );
  }

  async shutdown(): Promise<void> {
    // Wait for sessionEnd event if not already received (with timeout)
    if (!this.sessionEnded) {
      await Promise.race([
        new Promise<void>((resolve) => {
          this.sessionEndResolve = resolve;
        }),
        new Promise<void>((resolve) => setTimeout(resolve, 5000)), // 5s timeout
      ]);
    }

    // Give React a tick to process any pending state updates and render
    await new Promise<void>((resolve) => setImmediate(resolve));

    // Unsubscribe from all events
    for (const unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    this.subscriptions = [];

    // Remove SIGINT handler
    if (this.sigintHandler) {
      process.off("SIGINT", this.sigintHandler);
      this.sigintHandler = undefined;
    }

    // Unmount Ink app
    if (this.instance) {
      this.instance.unmount();
      this.instance = undefined;
    }

    this.actions = undefined;
    this.initialized = false;
    this.sessionEnded = false;
    this.sessionEndResolve = undefined;
  }

  private ensureInitialized(): void {
    if (!this.actions) {
      throw new Error("InkAdapter not initialized. Call initialize() first.");
    }
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get the current working directory displayed in footer
   */
  get cwd(): string | undefined {
    return this.options.cwd;
  }

  /**
   * Set the current working directory displayed in footer
   */
  set cwd(value: string | undefined) {
    this.options.cwd = value;
  }

  /**
   * Get the git branch displayed in footer
   */
  get branch(): string | undefined {
    return this.options.branch;
  }

  /**
   * Set the git branch displayed in footer
   */
  set branch(value: string | undefined) {
    this.options.branch = value;
  }

  /**
   * Update model name displayed in footer
   */
  setModelName(name: string): void {
    this.ensureInitialized();
    this.actions!.inkUI.setModelName(name);
  }

  /**
   * Update context usage percentage displayed in footer
   */
  setContextUsage(percentage: number): void {
    this.ensureInitialized();
    this.actions!.inkUI.setContextUsage(percentage);
  }

  /**
   * Set error message to display
   */
  setError(error: string | null): void {
    this.ensureInitialized();
    this.actions!.ui.setError(error);
  }

  /**
   * Request user input via the input prompt
   */
  async requestInput(prompt: string): Promise<string> {
    this.ensureInitialized();
    return this.actions!.inkUI.requestInput(prompt);
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create an InkAdapter instance.
 */
export function createInkAdapter(
  bus: UIEventBus,
  options?: InkAdapterOptions
): InkAdapter {
  return new InkAdapter(bus, options);
}
