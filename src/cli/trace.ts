/**
 * CLI Trace Formatter
 *
 * Formats runtime events for human-readable CLI output.
 * Uses boxen for panels and picocolors for styling.
 */

import boxen from "boxen";
import pc from "picocolors";
import type { RuntimeEvent } from "../runtime/events.js";

/**
 * Options for the trace formatter.
 */
export interface TraceFormatterOptions {
  /** Maximum length for content before truncation */
  maxContentLength?: number;
  /** Whether to show message contents (can be verbose) */
  showMessageContent?: boolean;
  /** Whether to show tool arguments */
  showToolArgs?: boolean;
  /** Whether to show timestamps */
  showTimestamps?: boolean;
}

const DEFAULT_OPTIONS: Required<TraceFormatterOptions> = {
  maxContentLength: 500,
  showMessageContent: false,
  showToolArgs: true,
  showTimestamps: false,
};

/**
 * Truncate a string to a maximum length.
 */
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 3) + "...";
}

/**
 * Format duration in milliseconds.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * Format tool arguments for display.
 */
function formatArgs(args: Record<string, unknown>, maxLen: number): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    let valueStr: string;
    if (typeof value === "string") {
      valueStr = truncate(value, maxLen);
    } else {
      valueStr = truncate(JSON.stringify(value), maxLen);
    }
    lines.push(`  ${pc.cyan(key)}: ${valueStr}`);
  }
  return lines.join("\n");
}

/**
 * Create a trace formatter that outputs to the console.
 */
export function createTraceFormatter(
  options: TraceFormatterOptions = {}
): (event: RuntimeEvent) => void {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return (event: RuntimeEvent) => {
    const timestamp = opts.showTimestamps
      ? pc.dim(`[${event.timestamp.toISOString()}] `)
      : "";

    switch (event.type) {
      case "execution_start": {
        console.log(
          boxen(
            `${pc.bold("Worker")}: ${event.workerName}\n` +
            `${pc.bold("Model")}: ${event.model}`,
            {
              title: pc.green("EXECUTION START"),
              padding: { left: 1, right: 1, top: 0, bottom: 0 },
              borderColor: "green",
              borderStyle: "round",
            }
          )
        );
        break;
      }

      case "message_send": {
        const msgSummary = event.messages.map(m => {
          if (m.role === "system") return pc.magenta("system");
          if (m.role === "user") return pc.blue("user");
          if (m.role === "assistant") return pc.green("assistant");
          if (m.role === "tool") return pc.yellow("tool");
          return m.role;
        }).join(" → ");

        console.log(
          `${timestamp}${pc.dim("⏳")} ${pc.bold(`Iteration ${event.iteration}`)}: ` +
          `Sending ${event.messages.length} messages [${msgSummary}] ` +
          `(${event.toolCount} tools available)`
        );

        if (opts.showMessageContent) {
          // Show last user or assistant message content
          const lastMsg = event.messages[event.messages.length - 1];
          if (lastMsg && typeof lastMsg.content === "string") {
            console.log(pc.dim(truncate(lastMsg.content, opts.maxContentLength)));
          }
        }
        break;
      }

      case "response_receive": {
        const hasText = event.text && event.text.length > 0;
        const hasToolCalls = event.toolCalls.length > 0;
        const usageStr = event.usage
          ? pc.dim(` (${event.usage.input}→${event.usage.output} tokens)`)
          : "";

        if (hasToolCalls) {
          const toolNames = event.toolCalls.map(tc => pc.yellow(tc.name)).join(", ");
          console.log(
            `${timestamp}${pc.dim("📥")} Response: ${event.toolCalls.length} tool call(s): ${toolNames}${usageStr}`
          );
        } else if (hasText) {
          console.log(
            `${timestamp}${pc.dim("📥")} Response: text output${usageStr}`
          );
        }

        if (hasText && !hasToolCalls) {
          // Show assistant response in a box when it's the final output
          console.log(
            boxen(truncate(event.text!, opts.maxContentLength), {
              title: pc.green("ASSISTANT"),
              padding: { left: 1, right: 1, top: 0, bottom: 0 },
              borderColor: "green",
              borderStyle: "round",
            })
          );
        } else if (hasText && hasToolCalls) {
          // Brief text before tool calls
          console.log(pc.dim(`  "${truncate(event.text!, 100)}"`));
        }
        break;
      }

      case "tool_call_start": {
        const header = event.toolTotal > 1
          ? `TOOL [${event.toolIndex}/${event.toolTotal}]: ${event.toolName}`
          : `TOOL: ${event.toolName}`;

        let content = "";
        if (opts.showToolArgs && Object.keys(event.toolArgs).length > 0) {
          content = formatArgs(event.toolArgs, opts.maxContentLength);
        }

        console.log(
          boxen(content || pc.dim("(no arguments)"), {
            title: pc.yellow(header),
            padding: { left: 1, right: 1, top: 0, bottom: 0 },
            borderColor: "yellow",
            borderStyle: "round",
          })
        );
        break;
      }

      case "approval_request": {
        console.log(
          `${timestamp}${pc.dim("🔒")} Approval required for ${pc.yellow(event.toolName)}`
        );
        break;
      }

      case "approval_decision": {
        const status = event.approved
          ? pc.green("✓ Approved")
          : pc.red("✗ Denied");
        const cached = event.cached ? pc.dim(" (cached)") : "";
        console.log(`${timestamp}${status}${cached}`);
        break;
      }

      case "tool_call_end": {
        const duration = pc.dim(`(${formatDuration(event.durationMs)})`);
        const truncatedNote = event.truncated ? pc.dim(" [truncated]") : "";

        console.log(
          boxen(
            truncate(event.output, opts.maxContentLength) + truncatedNote,
            {
              title: pc.cyan(`RESULT: ${event.toolName} ${duration}`),
              padding: { left: 1, right: 1, top: 0, bottom: 0 },
              borderColor: "cyan",
              borderStyle: "round",
            }
          )
        );
        break;
      }

      case "tool_call_error": {
        console.log(
          boxen(event.error, {
            title: pc.red(`ERROR: ${event.toolName}`),
            padding: { left: 1, right: 1, top: 0, bottom: 0 },
            borderColor: "red",
            borderStyle: "round",
          })
        );
        break;
      }

      case "execution_end": {
        const tokens = event.totalTokens
          ? `${event.totalTokens.input} in / ${event.totalTokens.output} out`
          : "N/A";

        console.log(
          boxen(
            `${pc.bold("Iterations")}: ${event.totalIterations}\n` +
            `${pc.bold("Tool Calls")}: ${event.totalToolCalls}\n` +
            `${pc.bold("Tokens")}: ${tokens}\n` +
            `${pc.bold("Duration")}: ${formatDuration(event.durationMs)}`,
            {
              title: pc.green("EXECUTION COMPLETE"),
              padding: { left: 1, right: 1, top: 0, bottom: 0 },
              borderColor: "green",
              borderStyle: "round",
            }
          )
        );
        break;
      }

      case "execution_error": {
        console.log(
          boxen(
            `${pc.bold("Error")}: ${event.error}\n` +
            `${pc.bold("Iterations")}: ${event.totalIterations}\n` +
            `${pc.bold("Tool Calls")}: ${event.totalToolCalls}\n` +
            `${pc.bold("Duration")}: ${formatDuration(event.durationMs)}`,
            {
              title: pc.red("EXECUTION FAILED"),
              padding: { left: 1, right: 1, top: 0, bottom: 0 },
              borderColor: "red",
              borderStyle: "round",
            }
          )
        );
        break;
      }
    }
  };
}
