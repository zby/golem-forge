/**
 * Event-Based CLI UI Adapter
 *
 * Terminal-based implementation of UIImplementation.
 * Subscribes to display events and emits action events via UIEventBus.
 */

import * as readline from "readline";
import pc from "picocolors";
import boxen from "boxen";
import {
  BaseUIImplementation,
  type UIEventBus,
  type MessageEvent,
  type StreamingEvent,
  type StatusEvent,
  type ToolStartedEvent,
  type ToolResultEvent,
  type WorkerUpdateEvent,
  type ApprovalRequiredEvent,
  type ManualToolsAvailableEvent,
  type DiffSummaryEvent,
  type DiffContentEvent,
  type InputPromptEvent,
  type SessionEndEvent,
  type Unsubscribe,
  type ToolResultValueEvent,
} from "@golem-forge/core";
import { renderDiff, getDiffSummary } from "./diff-renderer.js";

// ============================================================================
// Constants
// ============================================================================

/** Maximum characters to display for text/content results */
const MAX_CONTENT_DISPLAY_CHARS = 500;

/** Maximum files to display in file list results */
const MAX_FILE_LIST_DISPLAY = 20;

// ============================================================================
// Options
// ============================================================================

/**
 * Trace level controls what events are displayed.
 * - quiet: Only final assistant responses
 * - summary: Responses + minimal tool summaries
 * - full: All events including tool details
 * - debug: All events + extra diagnostic info
 */
export type TraceLevel = "quiet" | "summary" | "full" | "debug";

/**
 * Options for EventCLIAdapter.
 */
export interface EventCLIAdapterOptions {
  /** Input stream (defaults to process.stdin) */
  input?: NodeJS.ReadableStream;
  /** Output stream (defaults to process.stdout) */
  output?: NodeJS.WritableStream;
  /** Prefix for user prompts */
  promptPrefix?: string;
  /** Enable raw mode for key handling */
  enableRawMode?: boolean;
  /** Trace level (defaults to "full") */
  traceLevel?: TraceLevel;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Group items by a key function.
 */
function groupBy<T, K extends string>(items: T[], keyFn: (item: T) => K): Record<K, T[]> {
  const result: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(item);
  }
  return result as Record<K, T[]>;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Event-based CLI implementation of UIImplementation.
 *
 * This adapter:
 * - Subscribes to display events and renders them to the terminal
 * - Captures user input and emits action events
 * - Handles approval dialogs via readline
 */
export class EventCLIAdapter extends BaseUIImplementation {
  private rl?: readline.Interface;
  private options: Required<EventCLIAdapterOptions>;
  private initialized = false;
  private subscriptions: Unsubscribe[] = [];

  // State for streaming
  private streamingContent: Map<string, string> = new Map();

  // State for diff drill-down
  private pendingDiffSummary: {
    requestId: string;
    summaries: DiffSummaryEvent["summaries"];
  } | null = null;

  constructor(bus: UIEventBus, options: EventCLIAdapterOptions = {}) {
    super(bus);
    this.options = {
      input: options.input ?? process.stdin,
      output: options.output ?? process.stdout,
      promptPrefix: options.promptPrefix ?? "> ",
      enableRawMode: options.enableRawMode ?? true,
      traceLevel: options.traceLevel ?? "full",
    };
  }

  /**
   * Check if the current trace level should show a particular event type.
   */
  private shouldShow(level: TraceLevel): boolean {
    const levels: TraceLevel[] = ["quiet", "summary", "full", "debug"];
    const current = levels.indexOf(this.options.traceLevel);
    const required = levels.indexOf(level);
    return current >= required;
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create readline interface
    this.rl = readline.createInterface({
      input: this.options.input,
      output: this.options.output,
    });

    // Set up interrupt handler
    if (
      this.options.enableRawMode &&
      "isTTY" in this.options.input &&
      this.options.input.isTTY
    ) {
      this.setupInterruptHandler();
    }

    // Subscribe to all display events
    this.subscribeToEvents();

    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    // Unsubscribe from all events
    for (const unsubscribe of this.subscriptions) {
      unsubscribe();
    }
    this.subscriptions = [];

    // Close readline
    if (this.rl) {
      this.rl.close();
      this.rl = undefined;
    }

    this.initialized = false;
  }

  // ============================================================================
  // Event Subscriptions
  // ============================================================================

  private subscribeToEvents(): void {
    this.subscriptions.push(
      this.bus.on("message", (event) => this.handleMessage(event)),
      this.bus.on("streaming", (event) => this.handleStreaming(event)),
      this.bus.on("status", (event) => this.handleStatus(event)),
      this.bus.on("toolStarted", (event) => this.handleToolStarted(event)),
      this.bus.on("toolResult", (event) => this.handleToolResult(event)),
      this.bus.on("workerUpdate", (event) => this.handleWorkerUpdate(event)),
      this.bus.on("approvalRequired", (event) => this.handleApprovalRequired(event)),
      this.bus.on("manualToolsAvailable", (event) => this.handleManualToolsAvailable(event)),
      this.bus.on("diffSummary", (event) => this.handleDiffSummary(event)),
      this.bus.on("diffContent", (event) => this.handleDiffContent(event)),
      this.bus.on("inputPrompt", (event) => this.handleInputPrompt(event)),
      this.bus.on("sessionEnd", (event) => this.handleSessionEnd(event))
    );
  }

  private setupInterruptHandler(): void {
    if (this.rl) {
      this.rl.on("close", () => {
        this.sendInterrupt("User closed input");
      });

      // Also handle SIGINT (Ctrl+C)
      process.on("SIGINT", () => {
        this.sendInterrupt("User interrupted");
      });
    }
  }

  // ============================================================================
  // Display Event Handlers
  // ============================================================================

  private handleMessage(event: MessageEvent): void {
    const output = this.options.output as NodeJS.WriteStream;
    const msg = event.message;

    switch (msg.role) {
      case "user":
        // User messages shown at summary level and above
        if (!this.shouldShow("summary")) return;
        output.write(`${pc.blue("You")}: ${msg.content}\n`);
        break;
      case "assistant":
        // Assistant messages always shown (quiet level)
        if (this.options.traceLevel === "quiet") {
          // In quiet mode, just output the plain content
          output.write(msg.content + "\n");
        } else {
          output.write(
            boxen(msg.content, {
              title: pc.green("Golem"),
              padding: { left: 1, right: 1, top: 0, bottom: 0 },
              borderColor: "green",
              borderStyle: "round",
            }) + "\n"
          );
        }
        break;
      case "system":
        // System messages only at debug level
        if (!this.shouldShow("debug")) return;
        output.write(`${pc.dim("[System]")} ${pc.dim(msg.content)}\n`);
        break;
    }
  }

  private handleStreaming(event: StreamingEvent): void {
    // Streaming only shown at full level and above
    if (!this.shouldShow("full")) return;

    const output = this.options.output as NodeJS.WriteStream;

    if (event.done) {
      // Streaming complete - clear state
      this.streamingContent.delete(event.requestId);
      output.write("\n");
    } else {
      // Append delta and write to output
      const current = this.streamingContent.get(event.requestId) || "";
      this.streamingContent.set(event.requestId, current + event.delta);

      // Write delta directly (streaming output)
      if (event.delta) {
        output.write(event.delta);
      }
    }
  }

  private handleStatus(event: StatusEvent): void {
    // Errors always shown, warnings at summary+, info at full+
    if (event.type === "info" && !this.shouldShow("full")) return;
    if (event.type === "warning" && !this.shouldShow("summary")) return;
    // Errors always pass through

    const output = this.options.output as NodeJS.WriteStream;

    let prefix: string;
    switch (event.type) {
      case "info":
        prefix = pc.blue("ℹ");
        break;
      case "warning":
        prefix = pc.yellow("⚠");
        break;
      case "error":
        prefix = pc.red("✗");
        break;
    }

    output.write(`${prefix} ${event.message}\n`);
  }

  private handleToolStarted(event: ToolStartedEvent): void {
    // Tool started only shown at full level and above
    if (!this.shouldShow("full")) return;

    const output = this.options.output as NodeJS.WriteStream;
    output.write(`${pc.dim("●")} ${pc.bold(event.toolName)} ${pc.dim("started...")}\n`);
  }

  private handleToolResult(event: ToolResultEvent): void {
    // Tool results: errors shown at summary+, success at full+
    if (event.status === "error") {
      if (!this.shouldShow("summary")) return;
    } else {
      if (!this.shouldShow("full")) return;
    }

    const output = this.options.output as NodeJS.WriteStream;

    // Handle error status
    if (event.status === "error") {
      output.write(
        `${pc.red("✗")} ${pc.bold(event.toolName)} ${pc.red("failed")}: ${event.error}\n`
      );
      return;
    }

    // Handle interrupted status
    if (event.status === "interrupted") {
      output.write(
        `${pc.yellow("⚠")} ${pc.bold(event.toolName)} ${pc.yellow("interrupted")}\n`
      );
      return;
    }

    // Handle success status - display based on value kind
    if (!event.value) {
      output.write(
        `${pc.green("✓")} ${pc.bold(event.toolName)} ${pc.dim(`(${event.durationMs}ms)`)}\n`
      );
      return;
    }

    this.displayToolResultValue(event.toolName, event.value, event.durationMs);
  }

  private displayToolResultValue(
    toolName: string,
    value: ToolResultValueEvent,
    durationMs: number
  ): void {
    const output = this.options.output as NodeJS.WriteStream;

    switch (value.kind) {
      case "diff":
        this.displayDiffResult(toolName, value, durationMs);
        break;

      case "text":
        this.displayTextResult(toolName, value.content, durationMs);
        break;

      case "file_content":
        output.write(
          `${pc.green("✓")} ${pc.bold(toolName)} → ${pc.cyan(value.path)} ${pc.dim(`(${value.size} bytes, ${durationMs}ms)`)}\n`
        );
        if (value.content.length > MAX_CONTENT_DISPLAY_CHARS) {
          output.write(
            value.content.slice(0, MAX_CONTENT_DISPLAY_CHARS) +
              pc.dim(`\n... (${value.content.length - MAX_CONTENT_DISPLAY_CHARS} more chars)\n`)
          );
        } else {
          output.write(value.content + "\n");
        }
        break;

      case "file_list":
        output.write(
          `${pc.green("✓")} ${pc.bold(toolName)} → ${pc.cyan(value.path)} ${pc.dim(`(${value.count} entries, ${durationMs}ms)`)}\n`
        );
        for (let i = 0; i < Math.min(value.files.length, MAX_FILE_LIST_DISPLAY); i++) {
          output.write(`  ${value.files[i]}\n`);
        }
        if (value.files.length > MAX_FILE_LIST_DISPLAY) {
          output.write(pc.dim(`  ... and ${value.files.length - MAX_FILE_LIST_DISPLAY} more\n`));
        }
        break;

      case "json":
        const summaryText = value.summary ? ` - ${value.summary}` : "";
        output.write(
          `${pc.green("✓")} ${pc.bold(toolName)}${summaryText} ${pc.dim(`(${durationMs}ms)`)}\n`
        );
        const json = JSON.stringify(value.data, null, 2);
        if (json.length > MAX_CONTENT_DISPLAY_CHARS) {
          output.write(
            json.slice(0, MAX_CONTENT_DISPLAY_CHARS) +
              pc.dim(`\n... (${json.length - MAX_CONTENT_DISPLAY_CHARS} more chars)\n`)
          );
        } else {
          output.write(json + "\n");
        }
        break;
    }
  }

  private displayDiffResult(
    toolName: string,
    value: Extract<ToolResultValueEvent, { kind: "diff" }>,
    durationMs: number
  ): void {
    const output = this.options.output as NodeJS.WriteStream;

    const title = value.isNew
      ? pc.green(`NEW: ${value.path}`)
      : pc.yellow(`MODIFIED: ${value.path}`);

    const summary = getDiffSummary(value.original, value.modified, value.isNew);

    output.write("\n" + "─".repeat(60) + "\n");
    output.write(
      `${pc.green("✓")} ${pc.bold(toolName)} → ${title} ${pc.dim(`(${summary}, ${value.bytesWritten} bytes, ${durationMs}ms)`)}\n`
    );
    output.write("─".repeat(60) + "\n");

    output.write(renderDiff(value.original, value.modified, { isNew: value.isNew }) + "\n");

    output.write("─".repeat(60) + "\n");
  }

  private displayTextResult(toolName: string, content: string, durationMs: number): void {
    const output = this.options.output as NodeJS.WriteStream;

    output.write(`${pc.green("✓")} ${pc.bold(toolName)} ${pc.dim(`(${durationMs}ms)`)}\n`);

    if (content.length > MAX_CONTENT_DISPLAY_CHARS) {
      output.write(
        content.slice(0, MAX_CONTENT_DISPLAY_CHARS) +
          pc.dim(`... (${content.length - MAX_CONTENT_DISPLAY_CHARS} more chars)\n`)
      );
    } else {
      output.write(content + "\n");
    }
  }

  private handleWorkerUpdate(event: WorkerUpdateEvent): void {
    // Worker updates only shown at full level and above
    if (!this.shouldShow("full")) return;

    const output = this.options.output as NodeJS.WriteStream;
    const indent = "  ".repeat(event.depth);

    let symbol: string;
    switch (event.status) {
      case "complete":
        symbol = pc.green("✓");
        break;
      case "running":
        symbol = pc.yellow("●");
        break;
      case "error":
        symbol = pc.red("✗");
        break;
      default:
        symbol = pc.dim("○");
    }

    output.write(`${indent}${symbol} ${event.task}\n`);
  }

  private handleApprovalRequired(event: ApprovalRequiredEvent): void {
    const output = this.options.output as NodeJS.WriteStream;

    // Display approval request
    output.write("\n" + "─".repeat(60) + "\n");
    output.write(pc.yellow("APPROVAL REQUIRED") + "\n");
    output.write("─".repeat(60) + "\n");

    output.write(`${pc.bold("Type")}: ${event.type}\n`);
    output.write(`${pc.bold("Description")}: ${event.description}\n`);
    output.write(`${pc.bold("Risk")}: ${this.formatRisk(event.risk)}\n`);

    if (event.workerPath.length > 1) {
      const path = event.workerPath.map((w) => w.task).join(" → ");
      output.write(`${pc.bold("Path")}: ${path}\n`);
    }

    if (event.details) {
      output.write(`${pc.bold("Details")}:\n`);
      output.write(this.formatDetails(event.details) + "\n");
    }

    output.write("─".repeat(60) + "\n");

    // Prompt for approval
    this.promptApproval(event.requestId);
  }

  private promptApproval(requestId: string): void {
    if (!this.rl) return;

    this.rl.question("[y]es / [n]o / [a]lways / [s]ession: ", (answer) => {
      const result = this.parseApprovalAnswer(answer.trim().toLowerCase());

      if (typeof result.approved === "boolean") {
        this.sendApprovalResponse(requestId, result.approved, result.reason);
      } else {
        this.sendApprovalResponse(requestId, result.approved);
      }
    });
  }

  private parseApprovalAnswer(answer: string): {
    approved: boolean | "always" | "session";
    reason?: string;
  } {
    switch (answer) {
      case "y":
      case "yes":
        return { approved: true };
      case "n":
      case "no":
      case "":
        return { approved: false };
      case "a":
      case "always":
        return { approved: "always" };
      case "s":
      case "session":
        return { approved: "session" };
      default:
        const output = this.options.output as NodeJS.WriteStream;
        output.write(pc.dim("Unknown response, treating as 'no'\n"));
        return { approved: false, reason: "Unknown response" };
    }
  }

  private handleManualToolsAvailable(event: ManualToolsAvailableEvent): void {
    // Manual tools only shown at full level and above
    if (!this.shouldShow("full")) return;

    const output = this.options.output as NodeJS.WriteStream;

    output.write("\n" + pc.bold("Available manual tools:") + "\n");

    const byCategory = groupBy(event.tools, (t) => t.category ?? "General");

    for (const [category, categoryTools] of Object.entries(byCategory)) {
      output.write(`\n  ${pc.cyan(category)}:\n`);
      for (const tool of categoryTools) {
        output.write(`    ${pc.yellow(tool.name)} - ${tool.description}\n`);
      }
    }

    output.write(`\n${pc.dim("Run: /tool <name> [--arg value ...]")}\n`);
  }

  private handleDiffSummary(event: DiffSummaryEvent): void {
    // Diff summary only shown at full level and above
    if (!this.shouldShow("full")) return;

    const output = this.options.output as NodeJS.WriteStream;

    if (event.summaries.length === 0) {
      output.write(pc.dim("  No changes\n"));
      return;
    }

    // Store for potential drill-down
    this.pendingDiffSummary = {
      requestId: event.requestId,
      summaries: event.summaries,
    };

    // Display each file summary
    for (let i = 0; i < event.summaries.length; i++) {
      const s = event.summaries[i];
      const opSymbol = this.formatOperationSymbol(s.operation);
      const statsStr = this.formatDiffStats(s.additions, s.deletions);
      const indexStr = pc.dim(`[${i + 1}] `);

      output.write(`  ${indexStr}${opSymbol} ${s.path} ${statsStr}\n`);
    }

    // Prompt for drill-down selection
    this.promptDiffSelection(event.requestId, event.summaries.length);
  }

  private promptDiffSelection(requestId: string, count: number): void {
    if (!this.rl) return;

    this.rl.question(pc.dim(`View diff? [1-${count}] or [s]kip: `), (answer) => {
      const trimmed = answer.trim().toLowerCase();

      if (trimmed === "s" || trimmed === "skip" || trimmed === "") {
        this.pendingDiffSummary = null;
        return;
      }

      const num = parseInt(trimmed, 10);
      if (isNaN(num) || num < 1 || num > count) {
        this.pendingDiffSummary = null;
        return;
      }

      // Request the full diff
      const summaries = this.pendingDiffSummary?.summaries;
      if (summaries && summaries[num - 1]) {
        this.requestDiff(requestId, summaries[num - 1].path);
      }
    });
  }

  private handleDiffContent(event: DiffContentEvent): void {
    // Diff content only shown at full level and above
    if (!this.shouldShow("full")) return;

    const output = this.options.output as NodeJS.WriteStream;

    const title = event.isNew
      ? pc.green(`NEW: ${event.path}`)
      : pc.yellow(`MODIFIED: ${event.path}`);

    const summary = getDiffSummary(event.original, event.modified, event.isNew);

    output.write("\n" + "─".repeat(60) + "\n");
    output.write(`${title} ${pc.dim(`(${summary})`)}\n`);
    output.write("─".repeat(60) + "\n");

    output.write(renderDiff(event.original, event.modified, { isNew: event.isNew }) + "\n");

    output.write("─".repeat(60) + "\n");

    // Clear pending diff summary
    this.pendingDiffSummary = null;
  }

  private handleInputPrompt(event: InputPromptEvent): void {
    if (!this.rl) return;

    const prompt = event.prompt || this.options.promptPrefix;

    this.rl.question(prompt, (answer) => {
      this.sendUserInput(event.requestId, answer.trim());
    });
  }

  private handleSessionEnd(event: SessionEndEvent): void {
    const output = this.options.output as NodeJS.WriteStream;

    switch (event.reason) {
      case "completed":
        // Completed status only shown at full level and above
        if (!this.shouldShow("full")) return;
        output.write(pc.green("\n✓ Session completed") + (event.message ? `: ${event.message}` : "") + "\n");
        break;
      case "error":
        // Errors always shown
        output.write(pc.red("\n✗ Session ended with error") + (event.message ? `: ${event.message}` : "") + "\n");
        break;
      case "interrupted":
        // Interrupted always shown
        output.write(pc.yellow("\n⚠ Session interrupted") + (event.message ? `: ${event.message}` : "") + "\n");
        break;
    }
  }

  // ============================================================================
  // Formatting Helpers
  // ============================================================================

  private formatRisk(risk: "low" | "medium" | "high"): string {
    switch (risk) {
      case "low":
        return pc.green("low");
      case "medium":
        return pc.yellow("medium");
      case "high":
        return pc.red("high");
    }
  }

  private formatDetails(details: unknown): string {
    if (typeof details === "string") {
      return `  ${details}`;
    }
    if (typeof details === "object" && details !== null) {
      return Object.entries(details as Record<string, unknown>)
        .map(([key, value]) => {
          const valueStr =
            typeof value === "string"
              ? value.length > 60
                ? value.slice(0, 57) + "..."
                : value
              : JSON.stringify(value);
          return `  ${pc.cyan(key)}: ${valueStr}`;
        })
        .join("\n");
    }
    return `  ${String(details)}`;
  }

  private formatOperationSymbol(operation: "create" | "update" | "delete"): string {
    switch (operation) {
      case "create":
        return pc.green("A");
      case "update":
        return pc.yellow("M");
      case "delete":
        return pc.red("D");
    }
  }

  private formatDiffStats(additions: number, deletions: number): string {
    if (additions < 0 || deletions < 0) {
      return pc.dim("(modified)");
    }
    const parts: string[] = [];
    if (additions > 0) {
      parts.push(pc.green(`+${additions}`));
    }
    if (deletions > 0) {
      parts.push(pc.red(`-${deletions}`));
    }
    if (parts.length === 0) {
      return pc.dim("(no changes)");
    }
    return pc.dim(`(${parts.join(" ")})`);
  }
}

/**
 * Create an event-based CLI adapter with default options.
 */
export function createEventCLIAdapter(
  bus: UIEventBus,
  options?: EventCLIAdapterOptions
): EventCLIAdapter {
  return new EventCLIAdapter(bus, options);
}
