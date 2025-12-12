/**
 * Headless UI Adapter
 *
 * UI implementation for headless/CI mode.
 * Automatically handles manual tools and approvals without user interaction.
 */

import {
  type ApprovalRequiredEvent,
  type InputPromptEvent,
  type ManualToolsAvailableEvent,
  type SessionEndEvent,
  type Unsubscribe,
} from "../ui-events.js";
import type { UIEventBus } from "../ui-event-bus.js";
import { BaseUIImplementation } from "../ui-implementation.js";

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

/**
 * Headless UI adapter for CI/automated scenarios.
 */
export class HeadlessAdapter extends BaseUIImplementation {
  private options: Required<Pick<HeadlessAdapterOptions, "autoApprove" | "defaultInput">> &
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

  private subscribeToEvents(): void {
    this.subscriptions.push(
      this.bus.on("manualToolsAvailable", (event) => this.handleManualToolsAvailable(event)),
      this.bus.on("approvalRequired", (event) => this.handleApprovalRequired(event)),
      this.bus.on("inputPrompt", (event) => this.handleInputPrompt(event)),
      this.bus.on("sessionEnd", (event) => this.handleSessionEnd(event))
    );

    if (this.options.onEvent) {
      this.subscriptions.push(
        this.bus.on("message", (e) => this.options.onEvent?.("message", e)),
        this.bus.on("streaming", (e) => this.options.onEvent?.("streaming", e)),
        this.bus.on("status", (e) => this.options.onEvent?.("status", e)),
        this.bus.on("toolStarted", (e) => this.options.onEvent?.("toolStarted", e)),
        this.bus.on("toolResult", (e) => this.options.onEvent?.("toolResult", e)),
        this.bus.on("workerUpdate", (e) => this.options.onEvent?.("workerUpdate", e))
      );
    }
  }

  private handleManualToolsAvailable(event: ManualToolsAvailableEvent): void {
    const { autoManualTool, onEvent } = this.options;

    onEvent?.("manualToolsAvailable", event);

    if (!autoManualTool) {
      return;
    }

    const tool = event.tools.find((t) => t.name === autoManualTool);

    if (tool) {
      this.invokeManualTool(tool.name, {});
    } else {
      onEvent?.(
        "warning",
        `Auto-manual tool '${autoManualTool}' not found in available tools: ${event.tools
          .map((t) => t.name)
          .join(", ")}`
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
      this.sendApprovalResponse(event.requestId, false, "Denied in headless mode");
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

export function createHeadlessAdapter(bus: UIEventBus, options?: HeadlessAdapterOptions): HeadlessAdapter {
  return new HeadlessAdapter(bus, options);
}
