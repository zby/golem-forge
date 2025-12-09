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
  type ToolResultValue,
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

/**
 * Parse a /tool command string into tool name and arguments.
 * Format: /tool <name> [--arg value ...]
 *
 * @returns null if not a valid /tool command
 */
function parseToolCommand(input: string): { toolName: string; args: Record<string, unknown> } | null {
  const trimmed = input.trim();

  // Must start with /tool
  if (!trimmed.startsWith("/tool ")) {
    return null;
  }

  // Remove "/tool " prefix
  const rest = trimmed.slice(6).trim();
  if (!rest) {
    return null;
  }

  // Split into tokens, respecting quoted strings
  const tokens: string[] = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";

  for (let i = 0; i < rest.length; i++) {
    const char = rest[i];

    if (!inQuote && (char === '"' || char === "'")) {
      inQuote = true;
      quoteChar = char;
    } else if (inQuote && char === quoteChar) {
      inQuote = false;
      quoteChar = "";
    } else if (!inQuote && char === " ") {
      if (current) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }
  if (current) {
    tokens.push(current);
  }

  if (tokens.length === 0) {
    return null;
  }

  const toolName = tokens[0];
  const args: Record<string, unknown> = {};

  // Parse --key value pairs
  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];

    if (token.startsWith("--")) {
      const key = token.slice(2);
      // Check if next token exists and is not another flag
      const nextToken = tokens[i + 1];
      if (key && nextToken && !nextToken.startsWith("--")) {
        // Try to parse as JSON, otherwise use as string
        try {
          args[key] = JSON.parse(nextToken);
        } catch {
          args[key] = nextToken;
        }
        i += 2;
      } else {
        // Flag without value (or followed by another flag), treat as true
        if (key) {
          args[key] = true;
        }
        i += 1;
      }
    } else {
      // Skip unknown tokens
      i += 1;
    }
  }

  return { toolName, args };
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
  private sigintHandler?: () => void;

  // State for streaming
  private streamingContent: Map<string, string> = new Map();

  // State for diff drill-down
  private pendingDiffSummary: {
    requestId: string;
    summaries: DiffSummaryEvent["summaries"];
  } | null = null;

  // State for manual tool input
  private availableManualTools: ManualToolsAvailableEvent["tools"] = [];
  private awaitingToolCommand = false;

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

    // Remove SIGINT handler to prevent memory leak
    if (this.sigintHandler) {
      process.off("SIGINT", this.sigintHandler);
      this.sigintHandler = undefined;
    }

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
      this.sigintHandler = () => {
        this.sendInterrupt("User interrupted");
      };
      process.on("SIGINT", this.sigintHandler);
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
    value: ToolResultValue,
    durationMs: number
  ): void {
    const output = this.options.output as NodeJS.WriteStream;

    // Use type assertions in switch cases due to TypeScript limitations with
    // discriminated unions when one variant has `kind: string`
    switch (value.kind) {
      case "diff": {
        const diff = value as import("@golem-forge/core").DiffResultValue;
        this.displayDiffResult(toolName, diff, durationMs);
        break;
      }

      case "text": {
        const text = value as import("@golem-forge/core").TextResultValue;
        this.displayTextResult(toolName, text.content, durationMs);
        break;
      }

      case "file_content": {
        const fc = value as import("@golem-forge/core").FileContentResultValue;
        output.write(
          `${pc.green("✓")} ${pc.bold(toolName)} → ${pc.cyan(fc.path)} ${pc.dim(`(${fc.size} bytes, ${durationMs}ms)`)}\n`
        );
        if (fc.content.length > MAX_CONTENT_DISPLAY_CHARS) {
          output.write(
            fc.content.slice(0, MAX_CONTENT_DISPLAY_CHARS) +
              pc.dim(`\n... (${fc.content.length - MAX_CONTENT_DISPLAY_CHARS} more chars)\n`)
          );
        } else {
          output.write(fc.content + "\n");
        }
        break;
      }

      case "file_list": {
        const fl = value as import("@golem-forge/core").FileListResultValue;
        output.write(
          `${pc.green("✓")} ${pc.bold(toolName)} → ${pc.cyan(fl.path)} ${pc.dim(`(${fl.count} entries, ${durationMs}ms)`)}\n`
        );
        for (let i = 0; i < Math.min(fl.files.length, MAX_FILE_LIST_DISPLAY); i++) {
          output.write(`  ${fl.files[i]}\n`);
        }
        if (fl.files.length > MAX_FILE_LIST_DISPLAY) {
          output.write(pc.dim(`  ... and ${fl.files.length - MAX_FILE_LIST_DISPLAY} more\n`));
        }
        break;
      }

      case "json": {
        const json = value as import("@golem-forge/core").JsonResultValue;
        this.displayJsonResult(toolName, json, durationMs);
        break;
      }

      default:
        // Custom/unknown result type - use display hints
        this.displayCustomResult(toolName, value, durationMs);
        break;
    }
  }

  private displayJsonResult(
    toolName: string,
    value: Extract<ToolResultValue, { kind: "json" }>,
    durationMs: number
  ): void {
    const output = this.options.output as NodeJS.WriteStream;
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
  }

  private displayCustomResult(
    toolName: string,
    value: ToolResultValue,
    durationMs: number
  ): void {
    const output = this.options.output as NodeJS.WriteStream;

    // Get summary text
    const summaryText = "summary" in value && value.summary
      ? ` - ${value.summary}`
      : ` (${value.kind})`;

    // Check display hints for preferred rendering
    const display = "display" in value ? value.display : undefined;
    const preferredView = display?.preferredView;

    // Handle hidden results
    if (preferredView === "hidden") {
      return;
    }

    output.write(
      `${pc.green("✓")} ${pc.bold(toolName)}${summaryText} ${pc.dim(`(${durationMs}ms)`)}\n`
    );

    // Get data to display
    const data = "data" in value ? value.data : value;

    // Render based on preferred view or infer from data
    switch (preferredView) {
      case "text":
      case "markdown":
        if (typeof data === "string") {
          if (data.length > MAX_CONTENT_DISPLAY_CHARS) {
            output.write(
              data.slice(0, MAX_CONTENT_DISPLAY_CHARS) +
                pc.dim(`... (${data.length - MAX_CONTENT_DISPLAY_CHARS} more chars)\n`)
            );
          } else {
            output.write(data + "\n");
          }
        } else {
          this.displayAsTree(output, data);
        }
        break;

      case "code":
        const lang = display?.language || "";
        if (typeof data === "string") {
          output.write(pc.dim(`\`\`\`${lang}\n`));
          if (data.length > MAX_CONTENT_DISPLAY_CHARS) {
            output.write(data.slice(0, MAX_CONTENT_DISPLAY_CHARS) + pc.dim("..."));
          } else {
            output.write(data);
          }
          output.write(pc.dim("\n```\n"));
        } else {
          this.displayAsTree(output, data);
        }
        break;

      case "table":
        this.displayAsTable(output, data);
        break;

      case "tree":
        this.displayAsTree(output, data);
        break;

      case "raw":
      default:
        // Default: display as JSON tree
        this.displayAsTree(output, data);
        break;
    }
  }

  private displayAsTree(output: NodeJS.WriteStream, data: unknown, indent = ""): void {
    if (data === null || data === undefined) {
      output.write(pc.dim("null") + "\n");
      return;
    }

    if (typeof data !== "object") {
      output.write(String(data) + "\n");
      return;
    }

    if (Array.isArray(data)) {
      if (data.length === 0) {
        output.write(pc.dim("[]") + "\n");
        return;
      }
      for (let i = 0; i < Math.min(data.length, 20); i++) {
        output.write(`${indent}${pc.dim(`[${i}]`)} `);
        const item = data[i];
        if (typeof item === "object" && item !== null) {
          output.write("\n");
          this.displayAsTree(output, item, indent + "  ");
        } else {
          output.write(String(item) + "\n");
        }
      }
      if (data.length > 20) {
        output.write(`${indent}${pc.dim(`... and ${data.length - 20} more items`)}\n`);
      }
      return;
    }

    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) {
      output.write(pc.dim("{}") + "\n");
      return;
    }
    for (const [key, val] of entries.slice(0, 30)) {
      output.write(`${indent}${pc.cyan(key)}: `);
      if (typeof val === "object" && val !== null) {
        output.write("\n");
        this.displayAsTree(output, val, indent + "  ");
      } else {
        const valStr = String(val);
        if (valStr.length > 60) {
          output.write(valStr.slice(0, 57) + pc.dim("...") + "\n");
        } else {
          output.write(valStr + "\n");
        }
      }
    }
    if (entries.length > 30) {
      output.write(`${indent}${pc.dim(`... and ${entries.length - 30} more keys`)}\n`);
    }
  }

  private displayAsTable(output: NodeJS.WriteStream, data: unknown): void {
    // Check if data is an array of objects (tabular)
    if (!Array.isArray(data) || data.length === 0) {
      this.displayAsTree(output, data);
      return;
    }

    const firstItem = data[0];
    if (typeof firstItem !== "object" || firstItem === null) {
      this.displayAsTree(output, data);
      return;
    }

    // Get column headers from first item
    const columns = Object.keys(firstItem as Record<string, unknown>);
    if (columns.length === 0) {
      this.displayAsTree(output, data);
      return;
    }

    // Calculate column widths
    const widths: Record<string, number> = {};
    for (const col of columns) {
      widths[col] = col.length;
    }
    for (const row of data.slice(0, 20)) {
      if (typeof row !== "object" || row === null) continue;
      for (const col of columns) {
        const val = String((row as Record<string, unknown>)[col] ?? "");
        widths[col] = Math.max(widths[col], Math.min(val.length, 30));
      }
    }

    // Print header
    const header = columns.map(c => c.padEnd(widths[c])).join(" | ");
    output.write(`  ${pc.bold(header)}\n`);
    output.write(`  ${columns.map(c => "─".repeat(widths[c])).join("─┼─")}\n`);

    // Print rows
    for (let i = 0; i < Math.min(data.length, 20); i++) {
      const row = data[i];
      if (typeof row !== "object" || row === null) continue;
      const rowStr = columns.map(c => {
        const val = String((row as Record<string, unknown>)[c] ?? "");
        return val.slice(0, widths[c]).padEnd(widths[c]);
      }).join(" | ");
      output.write(`  ${rowStr}\n`);
    }

    if (data.length > 20) {
      output.write(pc.dim(`  ... and ${data.length - 20} more rows\n`));
    }
  }

  private displayDiffResult(
    toolName: string,
    value: Extract<ToolResultValue, { kind: "diff" }>,
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

    // Note: "always" option is not shown because current ApprovalController
    // only supports session-level persistence, not permanent "always" rules
    this.rl.question("[y]es / [n]o / [s]ession: ", (answer) => {
      const result = this.parseApprovalAnswer(answer.trim().toLowerCase());

      if (typeof result.approved === "boolean") {
        this.sendApprovalResponse(requestId, result.approved, result.reason);
      } else {
        this.sendApprovalResponse(requestId, result.approved);
      }
    });
  }

  private parseApprovalAnswer(answer: string): {
    approved: boolean | "session";
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
    // Store available tools for validation
    this.availableManualTools = event.tools;

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

    output.write(`\n${pc.dim("Type /help for commands, or /tool <name> [--arg value ...]")}\n`);

    // Prompt for tool command input
    this.promptToolCommand();
  }

  private promptToolCommand(): void {
    if (!this.rl || this.availableManualTools.length === 0) return;
    if (this.awaitingToolCommand) return; // Prevent duplicate prompts

    this.awaitingToolCommand = true;
    const output = this.options.output as NodeJS.WriteStream;

    this.rl.question(pc.dim("/tool> "), (answer) => {
      this.awaitingToolCommand = false;
      const trimmed = answer.trim();

      // Skip empty input
      if (!trimmed) {
        return;
      }

      // Check for help command
      if (trimmed === "/help" || trimmed === "help" || trimmed === "?") {
        this.showManualCommandHelp();
        this.promptToolCommand(); // Re-prompt after showing help
        return;
      }

      // Check for skip/cancel
      if (trimmed === "skip" || trimmed === "s" || trimmed === "cancel" || trimmed === "c") {
        output.write(pc.dim("Skipped manual tool invocation\n"));
        return;
      }

      // Prepend /tool if user didn't include it
      const commandInput = trimmed.startsWith("/tool ") ? trimmed : `/tool ${trimmed}`;
      const parsed = parseToolCommand(commandInput);

      if (!parsed) {
        output.write(pc.red("Invalid command format. Use: /tool <name> [--arg value ...]\n"));
        this.promptToolCommand(); // Re-prompt
        return;
      }

      // Validate tool name exists
      const toolExists = this.availableManualTools.some((t) => t.name === parsed.toolName);
      if (!toolExists) {
        output.write(pc.red(`Unknown tool: ${parsed.toolName}\n`));
        output.write(pc.dim(`Available: ${this.availableManualTools.map((t) => t.name).join(", ")}\n`));
        this.promptToolCommand(); // Re-prompt
        return;
      }

      // Invoke the manual tool
      this.invokeManualTool(parsed.toolName, parsed.args);
      output.write(pc.green(`✓ Invoked ${parsed.toolName}\n`));
    });
  }

  private showManualCommandHelp(): void {
    const output = this.options.output as NodeJS.WriteStream;

    output.write("\n" + pc.bold("Manual Commands:") + "\n");
    output.write(`  ${pc.cyan("/help")}           Show this help message\n`);
    output.write(`  ${pc.cyan("/tool <name>")}    Invoke a tool (or just type the tool name)\n`);
    output.write(`  ${pc.cyan("skip")} or ${pc.cyan("s")}       Skip manual tool invocation\n`);
    output.write(`  ${pc.cyan("cancel")} or ${pc.cyan("c")}     Cancel manual tool invocation\n`);

    output.write("\n" + pc.bold("Tool Invocation:") + "\n");
    output.write(`  ${pc.dim("/tool <name> [--arg value ...]")}\n`);
    output.write(`  ${pc.dim("Example: /tool read_file --path /src/main.ts")}\n`);

    output.write("\n" + pc.bold("Available Tools:") + "\n");
    const byCategory = groupBy(this.availableManualTools, (t) => t.category ?? "General");
    for (const [category, categoryTools] of Object.entries(byCategory)) {
      output.write(`  ${pc.cyan(category)}:\n`);
      for (const tool of categoryTools) {
        output.write(`    ${pc.yellow(tool.name)} - ${tool.description}\n`);
      }
    }
    output.write("\n");
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

// Export parseToolCommand for testing
export { parseToolCommand };
