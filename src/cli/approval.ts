/**
 * CLI Approval Callback
 *
 * Terminal-based approval prompts for tool execution.
 */

import * as readline from "readline";
import type { ApprovalCallback, ApprovalRequest, ApprovalDecision } from "../approval/index.js";

/**
 * Trust level indicators for display.
 */
const TRUST_INDICATORS: Record<string, string> = {
  untrusted: "[UNTRUSTED]",
  session: "[Session]",
  workspace: "[Workspace]",
  full: "[Full Trust]",
};

/**
 * Format tool arguments for display.
 */
function formatArgs(args: Record<string, unknown>, indent: string = "  "): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    const valueStr = typeof value === "string"
      ? value.length > 60 ? value.slice(0, 57) + "..." : value
      : JSON.stringify(value);
    lines.push(`${indent}${key}: ${valueStr}`);
  }
  return lines.join("\n");
}

/**
 * Format git_stage arguments for display.
 * Shows files and commit message in a user-friendly way.
 */
function formatGitStageArgs(args: Record<string, unknown>): string {
  const lines: string[] = [];

  // Files to stage
  const files = args.files;
  if (Array.isArray(files) && files.length > 0) {
    lines.push("Files to stage:");
    for (const file of files) {
      lines.push(`  ${file}`);
    }
  }

  // Commit message
  const message = args.message;
  if (typeof message === "string") {
    lines.push("");
    lines.push(`Commit message: "${message}"`);
  }

  return lines.join("\n");
}

/**
 * Format git_push arguments for display.
 */
function formatGitPushArgs(args: Record<string, unknown>): string {
  const lines: string[] = [];

  const commitId = args.commitId;
  if (typeof commitId === "string") {
    lines.push(`Staged commit: ${commitId}`);
  }

  const target = args.target as Record<string, unknown> | undefined;
  if (target) {
    if (target.type === "local") {
      lines.push(`Target: local repository at ${target.path}`);
      if (target.branch) {
        lines.push(`Branch: ${target.branch}`);
      }
    } else if (target.type === "github") {
      lines.push(`Target: GitHub ${target.repo}`);
      if (target.branch) {
        lines.push(`Branch: ${target.branch}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Check if this is a git operation that needs special formatting.
 */
function isGitOperation(toolName: string): boolean {
  return toolName.startsWith("git_");
}

/**
 * Format arguments based on tool type.
 */
function formatToolArgs(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case "git_stage":
      return formatGitStageArgs(args);
    case "git_push":
      return formatGitPushArgs(args);
    default:
      return formatArgs(args);
  }
}

/**
 * Create a readline interface for terminal input.
 */
function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

/**
 * Prompt the user for input.
 */
async function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim().toLowerCase());
    });
  });
}

/**
 * Options for creating a CLI approval callback.
 */
export interface CLIApprovalOptions {
  /** Show trust level in prompts */
  showTrustLevel?: boolean;
  /** Custom prompt prefix */
  promptPrefix?: string;
}

/**
 * Create a CLI approval callback for terminal-based approval.
 *
 * @example
 * ```typescript
 * const callback = createCLIApprovalCallback();
 * const controller = new ApprovalController({
 *   mode: "interactive",
 *   approvalCallback: callback,
 * });
 * ```
 */
export function createCLIApprovalCallback(options: CLIApprovalOptions = {}): ApprovalCallback {
  const showTrustLevel = options.showTrustLevel ?? true;

  return async (request: ApprovalRequest): Promise<ApprovalDecision> => {
    const rl = createReadlineInterface();

    try {
      // Build the prompt display
      console.log("\n" + "─".repeat(60));
      console.log("APPROVAL REQUEST");
      console.log("─".repeat(60));

      if (showTrustLevel && request.securityContext?.trustLevel) {
        const trustLevel = request.securityContext.trustLevel;
        console.log(`Trust: ${TRUST_INDICATORS[trustLevel] || trustLevel}`);
      }

      console.log(`Tool: ${request.toolName}`);
      console.log(`Description: ${request.description}`);

      if (Object.keys(request.toolArgs).length > 0) {
        // Use tool-specific formatting for git operations
        if (isGitOperation(request.toolName)) {
          console.log("");
          console.log(formatToolArgs(request.toolName, request.toolArgs));
        } else {
          console.log("Arguments:");
          console.log(formatArgs(request.toolArgs));
        }
      }

      console.log("─".repeat(60));

      // Get user input
      const answer = await prompt(rl, "Approve? [y]es / [n]o / [r]emember: ");

      // Parse response
      if (answer === "y" || answer === "yes") {
        return { approved: true, remember: "none" };
      }

      if (answer === "r" || answer === "remember") {
        return { approved: true, remember: "session" };
      }

      if (answer === "n" || answer === "no" || answer === "") {
        return { approved: false, remember: "none" };
      }

      // Unknown input, treat as no
      console.log("Unknown response, treating as 'no'");
      return { approved: false, remember: "none" };
    } finally {
      rl.close();
    }
  };
}

/**
 * Create an auto-approve callback for non-interactive mode.
 * Useful for CI/CD pipelines or batch processing.
 */
export function createAutoApproveCallback(): ApprovalCallback {
  return async (_request: ApprovalRequest): Promise<ApprovalDecision> => {
    return { approved: true, remember: "none" };
  };
}

/**
 * Create an auto-deny callback for auto_deny mode.
 * Useful for security-sensitive environments.
 */
export function createAutoDenyCallback(reason?: string): ApprovalCallback {
  return async (_request: ApprovalRequest): Promise<ApprovalDecision> => {
    return {
      approved: false,
      remember: "none",
      note: reason || "Auto-denied in auto_deny mode",
    };
  };
}
