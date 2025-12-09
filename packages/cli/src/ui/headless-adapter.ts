/**
 * Headless UI Adapter
 *
 * UI implementation for headless/CI mode.
 * Automatically handles manual tools and approvals without user interaction.
 */

import {
  BaseUIImplementation,
  type UIEventBus,
  type ManualToolsAvailableEvent,
  type ApprovalRequiredEvent,
  type InputPromptEvent,
  type SessionEndEvent,
  type Unsubscribe,
} from "@golem-forge/core";

// ============================================================================
// Options
// ============================================================================

/**
 * Options for HeadlessAdapter.
 */
export interface HeadlessAdapterOptions {
  /**
   * Manual tool to auto-invoke when manual tools are available.
   * If not specified, no tool is auto-invoked.
   * @example 'submit'
   */
  autoManualTool?: string;

  /**
   * Whether to auto-approve all approval requests.
   * - true: Auto-approve everything
   * - false: Auto-deny everything (default)
   * - 'session': Auto-approve with session scope
   */
  autoApprove?: boolean | "session";

  /**
   * Default input to provide when input is requested.
   * If not specified, an empty string is sent.
   */
  defaultInput?: string;

  /**
   * Callback for logging events (optional).
   * Called for each event that would be displayed in interactive mode.
   */
  onEvent?: (event: string, data: unknown) => void;

  /**
   * Callback when session ends.
   */
  onSessionEnd?: (reason: string, message?: string) => void;
}

// ============================================================================
// HeadlessAdapter
// ============================================================================

/**
 * Headless UI adapter for CI/automated scenarios.
 *
 * Automatically handles:
 * - Manual tool invocations (via autoManualTool option)
 * - Approval requests (via autoApprove option)
 * - Input prompts (via defaultInput option)
 *
 * @example
 * ```typescript
 * const adapter = new HeadlessAdapter(bus, {
 *   autoManualTool: 'submit',
 *   autoApprove: true,
 * });
 *
 * await adapter.initialize();
 * // Runtime can now execute without user interaction
 * ```
 */
export class HeadlessAdapter extends BaseUIImplementation {
  private options: Required<
    Pick<HeadlessAdapterOptions, "autoApprove" | "defaultInput">
  > &
    HeadlessAdapterOptions;
  private subscriptions: Unsubscribe[] = [];
  private initialized = false;

  constructor(bus: UIEventBus, options: HeadlessAdapterOptions = {}) {
    super(bus);
    this.options = {
      autoApprove: false,
      defaultInput: "",
      ...options,
    };
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.subscribeToEvents();
    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    for (const unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    this.subscriptions = [];
    this.initialized = false;
  }

  // ============================================================================
  // Event Subscriptions
  // ============================================================================

  private subscribeToEvents(): void {
    this.subscriptions.push(
      this.bus.on("manualToolsAvailable", (event) =>
        this.handleManualToolsAvailable(event)
      ),
      this.bus.on("approvalRequired", (event) =>
        this.handleApprovalRequired(event)
      ),
      this.bus.on("inputPrompt", (event) => this.handleInputPrompt(event)),
      this.bus.on("sessionEnd", (event) => this.handleSessionEnd(event))
    );

    // Optional: log all events if callback provided
    if (this.options.onEvent) {
      this.subscriptions.push(
        this.bus.on("message", (e) => this.options.onEvent?.("message", e)),
        this.bus.on("streaming", (e) => this.options.onEvent?.("streaming", e)),
        this.bus.on("status", (e) => this.options.onEvent?.("status", e)),
        this.bus.on("toolStarted", (e) =>
          this.options.onEvent?.("toolStarted", e)
        ),
        this.bus.on("toolResult", (e) =>
          this.options.onEvent?.("toolResult", e)
        ),
        this.bus.on("workerUpdate", (e) =>
          this.options.onEvent?.("workerUpdate", e)
        )
      );
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private handleManualToolsAvailable(event: ManualToolsAvailableEvent): void {
    const { autoManualTool, onEvent } = this.options;

    onEvent?.("manualToolsAvailable", event);

    if (!autoManualTool) {
      return;
    }

    // Find the tool to auto-invoke
    const tool = event.tools.find((t) => t.name === autoManualTool);

    if (tool) {
      this.invokeManualTool(tool.name, {});
    } else {
      // Tool not found - log warning if callback provided
      onEvent?.(
        "warning",
        `Auto-manual tool '${autoManualTool}' not found in available tools: ${event.tools.map((t) => t.name).join(", ")}`
      );
    }
  }

  private handleApprovalRequired(event: ApprovalRequiredEvent): void {
    const { autoApprove, onEvent } = this.options;

    onEvent?.("approvalRequired", event);

    if (autoApprove === true) {
      this.sendApprovalResponse(event.requestId, true);
    } else if (autoApprove === "session") {
      this.sendApprovalResponse(event.requestId, "session");
    } else {
      // Auto-deny
      this.sendApprovalResponse(
        event.requestId,
        false,
        "Denied in headless mode"
      );
    }
  }

  private handleInputPrompt(event: InputPromptEvent): void {
    const { defaultInput, onEvent } = this.options;

    onEvent?.("inputPrompt", event);

    this.sendUserInput(event.requestId, defaultInput);
  }

  private handleSessionEnd(event: SessionEndEvent): void {
    this.options.onEvent?.("sessionEnd", event);
    this.options.onSessionEnd?.(event.reason, event.message);
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a HeadlessAdapter instance.
 *
 * @example
 * ```typescript
 * const adapter = createHeadlessAdapter(bus, {
 *   autoManualTool: 'submit',
 *   autoApprove: true,
 * });
 * ```
 */
export function createHeadlessAdapter(
  bus: UIEventBus,
  options?: HeadlessAdapterOptions
): HeadlessAdapter {
  return new HeadlessAdapter(bus, options);
}
