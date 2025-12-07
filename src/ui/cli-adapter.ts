/**
 * CLI UI Adapter
 *
 * Terminal-based implementation of UIAdapter.
 * Provides CLI interface for worker execution.
 */

import * as readline from "readline";
import pc from "picocolors";
import boxen from "boxen";
import type { UIAdapter } from "./adapter.js";
import type {
  Message,
  UIApprovalRequest,
  UIApprovalResult,
  ManualToolInfo,
  ManualToolHandler,
  TaskProgress,
  StatusUpdate,
  DiffContent,
  TypedToolResult,
  DiffResultValue,
  FileContentResultValue,
  FileListResultValue,
  JsonResultValue,
} from "./types.js";
import { renderDiff, getDiffSummary } from "./diff-renderer.js";

// ============================================================================
// Constants
// ============================================================================

/** Maximum characters to display for text/content results */
const MAX_CONTENT_DISPLAY_CHARS = 500;

/** Maximum files to display in file list results */
const MAX_FILE_LIST_DISPLAY = 20;

/**
 * Options for CLIAdapter.
 */
export interface CLIAdapterOptions {
  /** Input stream (defaults to process.stdin) */
  input?: NodeJS.ReadableStream;
  /** Output stream (defaults to process.stdout) */
  output?: NodeJS.WritableStream;
  /** Prefix for user prompts */
  promptPrefix?: string;
  /** Enable raw mode for key handling */
  enableRawMode?: boolean;
}

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
 * CLI implementation of UIAdapter.
 */
export class CLIAdapter implements UIAdapter {
  private rl?: readline.Interface;
  private manualToolHandler?: ManualToolHandler;
  private interruptHandler?: () => void;
  private options: Required<CLIAdapterOptions>;
  private initialized = false;

  constructor(options: CLIAdapterOptions = {}) {
    this.options = {
      input: options.input ?? process.stdin,
      output: options.output ?? process.stdout,
      promptPrefix: options.promptPrefix ?? "> ",
      enableRawMode: options.enableRawMode ?? true,
    };
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.rl = readline.createInterface({
      input: this.options.input,
      output: this.options.output,
    });

    // Set up Esc key handler if raw mode is enabled and stdin is a TTY
    if (
      this.options.enableRawMode &&
      "isTTY" in this.options.input &&
      this.options.input.isTTY &&
      "setRawMode" in this.options.input
    ) {
      this.setupInterruptHandler();
    }

    this.initialized = true;
  }

  async shutdown(): Promise<void> {
    if (this.rl) {
      this.rl.close();
      this.rl = undefined;
    }
    this.initialized = false;
  }

  /**
   * Set up interrupt handler for Esc key.
   */
  private setupInterruptHandler(): void {
    // Note: Full implementation would use raw mode to capture Esc
    // For now, we use readline's 'close' event as a proxy for Ctrl+C
    if (this.rl) {
      this.rl.on("close", () => {
        if (this.interruptHandler) {
          this.interruptHandler();
        }
      });
    }
  }

  // ============================================================================
  // Conversation
  // ============================================================================

  async displayMessage(msg: Message): Promise<void> {
    const output = this.options.output as NodeJS.WriteStream;

    switch (msg.role) {
      case "user":
        output.write(`${pc.blue("You")}: ${msg.content}\n`);
        break;
      case "assistant":
        output.write(
          boxen(msg.content, {
            title: pc.green("Golem"),
            padding: { left: 1, right: 1, top: 0, bottom: 0 },
            borderColor: "green",
            borderStyle: "round",
          }) + "\n"
        );
        break;
      case "system":
        output.write(`${pc.dim("[System]")} ${pc.dim(msg.content)}\n`);
        break;
    }
  }

  async getUserInput(prompt?: string): Promise<string> {
    if (!this.rl) {
      throw new Error("CLIAdapter not initialized. Call initialize() first.");
    }

    const displayPrompt = prompt ?? this.options.promptPrefix;

    return new Promise((resolve) => {
      this.rl!.question(displayPrompt, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  // ============================================================================
  // Approval
  // ============================================================================

  async requestApproval(request: UIApprovalRequest): Promise<UIApprovalResult> {
    if (!this.rl) {
      throw new Error("CLIAdapter not initialized. Call initialize() first.");
    }

    const output = this.options.output as NodeJS.WriteStream;

    // Display approval request
    output.write("\n" + "─".repeat(60) + "\n");
    output.write(pc.yellow("APPROVAL REQUIRED") + "\n");
    output.write("─".repeat(60) + "\n");

    output.write(`${pc.bold("Type")}: ${request.type}\n`);
    output.write(`${pc.bold("Description")}: ${request.description}\n`);
    output.write(`${pc.bold("Risk")}: ${this.formatRisk(request.risk)}\n`);

    if (request.workerPath.length > 1) {
      const path = request.workerPath.map((w) => w.task).join(" → ");
      output.write(`${pc.bold("Path")}: ${path}\n`);
    }

    if (request.details) {
      output.write(`${pc.bold("Details")}:\n`);
      output.write(this.formatDetails(request.details) + "\n");
    }

    output.write("─".repeat(60) + "\n");

    // Get user decision
    const answer = await this.promptApproval();

    return this.parseApprovalAnswer(answer);
  }

  /**
   * Format risk level for display.
   */
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

  /**
   * Format details for display.
   */
  private formatDetails(details: unknown): string {
    if (typeof details === "string") {
      return `  ${details}`;
    }
    if (typeof details === "object" && details !== null) {
      return Object.entries(details as Record<string, unknown>)
        .map(([key, value]) => {
          const valueStr = typeof value === "string"
            ? value.length > 60 ? value.slice(0, 57) + "..." : value
            : JSON.stringify(value);
          return `  ${pc.cyan(key)}: ${valueStr}`;
        })
        .join("\n");
    }
    return `  ${String(details)}`;
  }

  /**
   * Prompt for approval decision.
   */
  private async promptApproval(): Promise<string> {
    return new Promise((resolve) => {
      this.rl!.question("[y]es / [n]o / [a]lways / [s]ession: ", (answer) => {
        resolve(answer.trim().toLowerCase());
      });
    });
  }

  /**
   * Parse approval answer.
   */
  private parseApprovalAnswer(answer: string): UIApprovalResult {
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
        // Unknown input, treat as no
        const output = this.options.output as NodeJS.WriteStream;
        output.write(pc.dim("Unknown response, treating as 'no'\n"));
        return { approved: false };
    }
  }

  // ============================================================================
  // Manual Tools
  // ============================================================================

  displayManualTools(tools: ManualToolInfo[]): void {
    const output = this.options.output as NodeJS.WriteStream;

    output.write("\n" + pc.bold("Available manual tools:") + "\n");

    const byCategory = groupBy(tools, (t) => t.category ?? "General");

    for (const [category, categoryTools] of Object.entries(byCategory)) {
      output.write(`\n  ${pc.cyan(category)}:\n`);
      for (const tool of categoryTools) {
        output.write(`    ${pc.yellow(tool.name)} - ${tool.description}\n`);
      }
    }

    output.write(`\n${pc.dim("Run: /tool <name> [--arg value ...]")}\n`);
  }

  onManualToolRequest(handler: ManualToolHandler): void {
    this.manualToolHandler = handler;
  }

  /**
   * Execute a manual tool.
   * Called when user invokes a tool via /tool command.
   */
  async executeManualTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<void> {
    if (!this.manualToolHandler) {
      const output = this.options.output as NodeJS.WriteStream;
      output.write(pc.red("No manual tool handler registered\n"));
      return;
    }

    const result = await this.manualToolHandler(toolName, args);

    const output = this.options.output as NodeJS.WriteStream;
    if (result.success) {
      output.write(pc.green("✓ ") + `${toolName} completed\n`);
      if (result.result !== undefined) {
        output.write(this.formatDetails(result.result) + "\n");
      }
    } else {
      output.write(pc.red("✗ ") + `${toolName} failed: ${result.error}\n`);
    }
  }

  // ============================================================================
  // Interruption
  // ============================================================================

  onInterrupt(handler: () => void): void {
    this.interruptHandler = handler;
  }

  // ============================================================================
  // Progress
  // ============================================================================

  showProgress(task: TaskProgress): void {
    const output = this.options.output as NodeJS.WriteStream;
    const indent = "  ".repeat(task.depth);

    let symbol: string;
    switch (task.status) {
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

    output.write(`${indent}${symbol} ${task.description}\n`);
  }

  updateStatus(status: StatusUpdate): void {
    const output = this.options.output as NodeJS.WriteStream;

    let prefix: string;
    switch (status.type) {
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

    output.write(`${prefix} ${status.message}\n`);
  }

  // ============================================================================
  // Diff Review
  // ============================================================================

  async displayDiff(diff: DiffContent): Promise<void> {
    const output = this.options.output as NodeJS.WriteStream;

    const title = diff.isNew
      ? pc.green(`NEW: ${diff.path}`)
      : pc.yellow(`MODIFIED: ${diff.path}`);

    const summary = getDiffSummary(diff.original, diff.modified, diff.isNew);

    output.write("\n" + "─".repeat(60) + "\n");
    output.write(`${title} ${pc.dim(`(${summary})`)}\n`);
    output.write("─".repeat(60) + "\n");

    output.write(renderDiff(diff.original, diff.modified, { isNew: diff.isNew }) + "\n");

    output.write("─".repeat(60) + "\n");
  }

  // ============================================================================
  // Tool Results
  // ============================================================================

  async displayToolResult(result: TypedToolResult): Promise<void> {
    const output = this.options.output as NodeJS.WriteStream;

    // Handle error status
    if (result.status === "error") {
      output.write(
        `${pc.red("✗")} ${pc.bold(result.toolName)} ${pc.red("failed")}: ${result.error}\n`
      );
      return;
    }

    // Handle interrupted status
    if (result.status === "interrupted") {
      output.write(
        `${pc.yellow("⚠")} ${pc.bold(result.toolName)} ${pc.yellow("interrupted")}\n`
      );
      return;
    }

    // Handle success status - display based on value kind
    if (!result.value) {
      output.write(
        `${pc.green("✓")} ${pc.bold(result.toolName)} ${pc.dim(`(${result.durationMs}ms)`)}\n`
      );
      return;
    }

    switch (result.value.kind) {
      case "diff":
        this.displayDiffResult(result.toolName, result.value, result.durationMs);
        break;

      case "text":
        this.displayTextResult(result.toolName, result.value.content, result.durationMs);
        break;

      case "file_content":
        this.displayFileContentResult(result.toolName, result.value, result.durationMs);
        break;

      case "file_list":
        this.displayFileListResult(result.toolName, result.value, result.durationMs);
        break;

      case "json":
        this.displayJsonResult(result.toolName, result.value, result.durationMs);
        break;

      default:
        // Unknown kind, display as JSON
        output.write(
          `${pc.green("✓")} ${pc.bold(result.toolName)} ${pc.dim(`(${result.durationMs}ms)`)}\n`
        );
        output.write(JSON.stringify(result.value, null, 2) + "\n");
    }
  }

  /**
   * Display a diff result.
   */
  private displayDiffResult(
    toolName: string,
    value: DiffResultValue,
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

  /**
   * Display a text result.
   */
  private displayTextResult(toolName: string, content: string, durationMs: number): void {
    const output = this.options.output as NodeJS.WriteStream;

    output.write(
      `${pc.green("✓")} ${pc.bold(toolName)} ${pc.dim(`(${durationMs}ms)`)}\n`
    );

    // Truncate long content
    if (content.length > MAX_CONTENT_DISPLAY_CHARS) {
      output.write(content.slice(0, MAX_CONTENT_DISPLAY_CHARS) + pc.dim(`... (${content.length - MAX_CONTENT_DISPLAY_CHARS} more chars)\n`));
    } else {
      output.write(content + "\n");
    }
  }

  /**
   * Display a file content result.
   */
  private displayFileContentResult(
    toolName: string,
    value: FileContentResultValue,
    durationMs: number
  ): void {
    const output = this.options.output as NodeJS.WriteStream;

    output.write(
      `${pc.green("✓")} ${pc.bold(toolName)} → ${pc.cyan(value.path)} ${pc.dim(`(${value.size} bytes, ${durationMs}ms)`)}\n`
    );

    // Truncate long content
    if (value.content.length > MAX_CONTENT_DISPLAY_CHARS) {
      output.write(value.content.slice(0, MAX_CONTENT_DISPLAY_CHARS) + pc.dim(`\n... (${value.content.length - MAX_CONTENT_DISPLAY_CHARS} more chars)\n`));
    } else {
      output.write(value.content + "\n");
    }
  }

  /**
   * Display a file list result.
   */
  private displayFileListResult(
    toolName: string,
    value: FileListResultValue,
    durationMs: number
  ): void {
    const output = this.options.output as NodeJS.WriteStream;

    output.write(
      `${pc.green("✓")} ${pc.bold(toolName)} → ${pc.cyan(value.path)} ${pc.dim(`(${value.count} entries, ${durationMs}ms)`)}\n`
    );

    // Show files (limit to first N)
    for (let i = 0; i < Math.min(value.files.length, MAX_FILE_LIST_DISPLAY); i++) {
      output.write(`  ${value.files[i]}\n`);
    }
    if (value.files.length > MAX_FILE_LIST_DISPLAY) {
      output.write(pc.dim(`  ... and ${value.files.length - MAX_FILE_LIST_DISPLAY} more\n`));
    }
  }

  /**
   * Display a JSON result.
   */
  private displayJsonResult(
    toolName: string,
    value: JsonResultValue,
    durationMs: number
  ): void {
    const output = this.options.output as NodeJS.WriteStream;

    const summaryText = value.summary ? ` - ${value.summary}` : "";
    output.write(
      `${pc.green("✓")} ${pc.bold(toolName)}${summaryText} ${pc.dim(`(${durationMs}ms)`)}\n`
    );

    // Pretty print JSON (truncated)
    const json = JSON.stringify(value.data, null, 2);
    if (json.length > MAX_CONTENT_DISPLAY_CHARS) {
      output.write(json.slice(0, MAX_CONTENT_DISPLAY_CHARS) + pc.dim(`\n... (${json.length - MAX_CONTENT_DISPLAY_CHARS} more chars)\n`));
    } else {
      output.write(json + "\n");
    }
  }
}

/**
 * Create a CLI adapter with default options.
 */
export function createCLIAdapter(options?: CLIAdapterOptions): CLIAdapter {
  return new CLIAdapter(options);
}
