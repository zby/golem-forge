/**
 * CLI Approval Callback
 *
 * Implements ApprovalCallback for command-line interface using Node.js readline.
 * This is the real-world CLI implementation pattern.
 */

import * as readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import type {
  ApprovalCallback,
  ApprovalRequest,
  ApprovalDecision,
} from "../../../src/approval/index.js";

/**
 * Options for CLI approval callback
 */
export interface CliApprovalOptions {
  /** Show tool arguments in prompt */
  showArgs?: boolean;
  /** Default remember behavior */
  defaultRemember?: "none" | "session";
  /** Custom prompt formatter */
  formatPrompt?: (request: ApprovalRequest) => string;
}

/**
 * Default prompt formatter
 */
function defaultFormatPrompt(request: ApprovalRequest, showArgs: boolean): string {
  let prompt = `\n⚠️  APPROVAL REQUIRED\n`;
  prompt += `   Tool: ${request.toolName}\n`;
  prompt += `   Action: ${request.description}\n`;

  if (showArgs && Object.keys(request.toolArgs).length > 0) {
    prompt += `   Arguments: ${JSON.stringify(request.toolArgs, null, 2).split("\n").join("\n   ")}\n`;
  }

  prompt += `\n   Approve? [y]es / [n]o / [a]lways (session) > `;
  return prompt;
}

/**
 * Create a CLI approval callback using readline.
 *
 * Prompts the user interactively for each approval request.
 * Supports:
 * - y/yes: Approve once
 * - n/no: Deny
 * - a/always: Approve and remember for session
 */
export function createCliApprovalCallback(
  options: CliApprovalOptions = {}
): ApprovalCallback {
  const {
    showArgs = true,
    defaultRemember = "none",
    formatPrompt,
  } = options;

  return async (request: ApprovalRequest): Promise<ApprovalDecision> => {
    const rl = readline.createInterface({ input, output });

    try {
      const prompt = formatPrompt
        ? formatPrompt(request)
        : defaultFormatPrompt(request, showArgs);

      const answer = await rl.question(prompt);
      const normalized = answer.toLowerCase().trim();

      if (normalized === "y" || normalized === "yes") {
        return { approved: true, remember: defaultRemember };
      }

      if (normalized === "a" || normalized === "always") {
        return { approved: true, remember: "session" };
      }

      if (normalized === "n" || normalized === "no" || normalized === "") {
        return { approved: false, note: "User denied" };
      }

      // Unknown input - treat as denial
      return { approved: false, note: `Unknown response: ${answer}` };
    } finally {
      rl.close();
    }
  };
}

/**
 * Create a non-interactive CLI callback for testing/automation.
 * Always returns the specified decision.
 */
export function createAutoApprovalCallback(
  approve: boolean,
  remember: "none" | "session" = "session"
): ApprovalCallback {
  return async (_request: ApprovalRequest): Promise<ApprovalDecision> => {
    return approve
      ? { approved: true, remember }
      : { approved: false, note: "Auto-denied" };
  };
}
