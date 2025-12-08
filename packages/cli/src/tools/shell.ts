/**
 * Shell Tool
 *
 * LLM tool for shell command execution with whitelist-based approval.
 *
 * Security model:
 * - Commands must match a rule OR have a default to be allowed
 * - No rule + no default = command is blocked
 * - Shell metacharacters are blocked to prevent injection
 * - Commands are executed with shell=false for security
 *
 * For kernel-level isolation, run in a Docker container.
 */

import { z } from 'zod';
import { spawn } from 'child_process';
import * as shlex from 'shlex';
import type { ToolExecutionOptions } from 'ai';
import { BlockedError, type ApprovalConfig } from '../approval/index.js';
import type { NamedTool } from './filesystem.js';

/**
 * Approval decision type for shell commands.
 */
type ApprovalDecisionType = 'preApproved' | 'ask' | 'blocked';

// ============================================================================
// Types
// ============================================================================

/**
 * Result from shell command execution.
 */
export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  truncated: boolean;
}

/**
 * Approval decision schema - matches filesystem approval types.
 */
const ApprovalDecisionSchema = z.enum(['preApproved', 'ask', 'blocked']);

/**
 * Pattern-based rule for shell command approval.
 *
 * Rules are matched in order. First match wins.
 *
 * Approval types (consistent with filesystem zones):
 * - 'preApproved': Command runs without user prompt
 * - 'ask': User is prompted for approval (default)
 * - 'blocked': Command is blocked entirely
 */
export const ShellRuleSchema = z.object({
  /** Command prefix to match (e.g., 'git status', 'git ') */
  pattern: z.string(),
  /** Approval decision for matching commands. Default: 'ask' */
  approval: ApprovalDecisionSchema.default('ask'),
});
export type ShellRule = z.infer<typeof ShellRuleSchema>;

/**
 * Default behavior for shell commands that don't match any rule.
 *
 * Whitelist model:
 * - Presence of a default section = unmatched commands are allowed
 * - Absence of default = unmatched commands are BLOCKED
 */
export const ShellDefaultSchema = z.object({
  /** Approval decision for unmatched commands. Default: 'ask' */
  approval: ApprovalDecisionSchema.default('ask'),
});
export type ShellDefault = z.infer<typeof ShellDefaultSchema>;

/**
 * Shell toolset configuration.
 */
export const ShellConfigSchema = z.object({
  rules: z.array(ShellRuleSchema).default([]),
  default: ShellDefaultSchema.optional(),
});
export type ShellConfig = z.infer<typeof ShellConfigSchema>;

// ============================================================================
// Constants
// ============================================================================

/**
 * Shell metacharacters that we block (to prevent shell injection).
 */
export const BLOCKED_METACHARACTERS = ['|', '>', '<', ';', '&', '`', '$(', '${'] as const;

/**
 * Maximum output size in bytes (50KB).
 */
export const MAX_OUTPUT_BYTES = 50 * 1024;

/**
 * Default timeout in seconds.
 */
export const DEFAULT_TIMEOUT = 30;

/**
 * Maximum timeout in seconds.
 */
export const MAX_TIMEOUT = 300;

// ============================================================================
// Errors
// ============================================================================

/**
 * Base error for shell execution failures.
 */
export class ShellError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShellError';
  }
}

/**
 * Raised when a command is blocked by rules or metacharacters.
 */
export class ShellBlockedError extends ShellError {
  constructor(message: string) {
    super(message);
    this.name = 'ShellBlockedError';
  }
}

// ============================================================================
// Execution Functions
// ============================================================================

/**
 * Check for blocked shell metacharacters.
 *
 * @throws ShellBlockedError if command contains blocked metacharacters
 */
export function checkMetacharacters(command: string): void {
  for (const char of BLOCKED_METACHARACTERS) {
    if (command.includes(char)) {
      throw new ShellBlockedError(
        `Command contains blocked metacharacter '${char}'. ` +
          'Shell metacharacters are not allowed for security reasons.'
      );
    }
  }
}

/**
 * Parse command string into arguments using shlex.
 *
 * @returns List of command arguments
 * @throws ShellBlockedError if command cannot be parsed
 */
export function parseCommand(command: string): string[] {
  try {
    return shlex.split(command);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new ShellBlockedError(`Cannot parse command: ${message}`);
  }
}

/**
 * Match result from shell rules.
 */
export interface MatchResult {
  /** Approval decision: 'preApproved', 'ask', or 'blocked' */
  approval: ApprovalDecisionType;
  /** Whether this came from a rule match (vs default or no-match) */
  matchedRule: boolean;
}

/**
 * Match command against shell rules (whitelist model).
 *
 * Whitelist semantics:
 * - Rule in config → use rule's approval setting
 * - No rule but default exists → use default's approval setting
 * - No rule and no default → 'blocked'
 *
 * @returns MatchResult with approval decision
 */
export function matchShellRules(
  command: string,
  rules: ShellRule[],
  defaultConfig?: ShellDefault
): MatchResult {
  // Check rules in order
  for (const rule of rules) {
    // Simple prefix match
    if (command.startsWith(rule.pattern) || command === rule.pattern) {
      return {
        approval: rule.approval,
        matchedRule: true,
      };
    }
  }

  // No rule matched - check for default
  if (defaultConfig !== undefined) {
    return {
      approval: defaultConfig.approval,
      matchedRule: false,
    };
  }

  // No rule and no default → blocked (whitelist model)
  return {
    approval: 'blocked',
    matchedRule: false,
  };
}

/**
 * Execute a shell command and return the result.
 *
 * @param command Command string to execute
 * @param workingDir Working directory for the command
 * @param timeout Timeout in seconds
 * @param env Environment variables
 * @returns ShellResult with stdout, stderr, exitCode, and truncated flag
 * @throws ShellBlockedError if command contains blocked metacharacters
 * @throws ShellError if command execution fails
 */
export async function executeShell(
  command: string,
  options: {
    workingDir?: string;
    timeout?: number;
    env?: Record<string, string>;
  } = {}
): Promise<ShellResult> {
  const { workingDir, timeout = DEFAULT_TIMEOUT, env } = options;

  // Check for blocked metacharacters
  checkMetacharacters(command);

  // Parse command
  const args = parseCommand(command);
  if (args.length === 0) {
    throw new ShellBlockedError('Empty command');
  }

  const [cmd, ...cmdArgs] = args;

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let truncated = false;
    let killed = false;

    const child = spawn(cmd, cmdArgs, {
      cwd: workingDir,
      env: env ? { ...process.env, ...env } : undefined,
      shell: false, // Don't use shell for security
    });

    // Set timeout
    const timeoutMs = Math.min(Math.max(timeout, 1), MAX_TIMEOUT) * 1000;
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (data: Buffer) => {
      const chunk = data.toString('utf-8');
      if (stdout.length + chunk.length > MAX_OUTPUT_BYTES) {
        stdout += chunk.slice(0, MAX_OUTPUT_BYTES - stdout.length);
        truncated = true;
      } else {
        stdout += chunk;
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      const chunk = data.toString('utf-8');
      if (stderr.length + chunk.length > MAX_OUTPUT_BYTES) {
        stderr += chunk.slice(0, MAX_OUTPUT_BYTES - stderr.length);
        truncated = true;
      } else {
        stderr += chunk;
      }
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);

      if (err.code === 'ENOENT') {
        resolve({
          stdout: '',
          stderr: `Command not found: ${cmd}`,
          exitCode: 127,
          truncated: false,
        });
      } else if (err.code === 'EACCES') {
        resolve({
          stdout: '',
          stderr: `Permission denied: ${cmd}`,
          exitCode: 126,
          truncated: false,
        });
      } else {
        reject(new ShellError(`Failed to execute command: ${err.message}`));
      }
    });

    child.on('close', (code: number | null) => {
      clearTimeout(timer);

      if (killed) {
        resolve({
          stdout,
          stderr: stderr + `\nCommand timed out after ${timeout} seconds`,
          exitCode: -1,
          truncated,
        });
      } else {
        if (truncated) {
          if (stdout.length >= MAX_OUTPUT_BYTES) {
            stdout += '\n... (output truncated)';
          }
          if (stderr.length >= MAX_OUTPUT_BYTES) {
            stderr += '\n... (output truncated)';
          }
        }

        resolve({
          stdout,
          stderr,
          exitCode: code ?? -1,
          truncated,
        });
      }
    });
  });
}

// ============================================================================
// Tool Creation
// ============================================================================

const shellToolSchema = z.object({
  command: z.string().describe('Command to execute (parsed with shlex)'),
  timeout: z
    .number()
    .int()
    .min(1)
    .max(MAX_TIMEOUT)
    .default(DEFAULT_TIMEOUT)
    .describe(`Timeout in seconds (default ${DEFAULT_TIMEOUT}, max ${MAX_TIMEOUT})`),
});
type ShellToolInput = z.infer<typeof shellToolSchema>;

/**
 * Options for creating a shell tool.
 */
export interface ShellToolOptions {
  /** Shell configuration with rules and default */
  config?: ShellConfig;
  /** Working directory for commands */
  workingDir?: string;
  /** Environment variables to add */
  env?: Record<string, string>;
}

/**
 * Create a shell tool with whitelist-based approval.
 *
 * The tool uses needsApproval as a function that checks rules at runtime.
 * Approval types match filesystem tools: 'preApproved', 'ask', 'blocked'.
 */
export function createShellTool(options: ShellToolOptions = {}): NamedTool {
  const { config = { rules: [] }, workingDir, env } = options;

  // Parse and validate config
  const parsedConfig = ShellConfigSchema.parse(config);

  return {
    name: 'shell',
    description:
      'Execute a shell command. Commands are parsed with shlex and ' +
      'executed without a shell for security. Shell metacharacters ' +
      '(|, >, <, ;, &, `, $()) are blocked.',
    inputSchema: shellToolSchema,

    // Dynamic approval check based on rules
    needsApproval: (input: ShellToolInput): boolean => {
      const { command } = input;

      // Check metacharacters first - if blocked, let execute handle the error
      try {
        checkMetacharacters(command);
        parseCommand(command);
      } catch {
        // Let execute handle the error with a proper message
        return false;
      }

      // Match against rules
      const result = matchShellRules(command, parsedConfig.rules, parsedConfig.default);

      switch (result.approval) {
        case 'preApproved':
          return false;  // No approval needed
        case 'ask':
          return true;   // Needs approval
        case 'blocked':
          // Will be blocked in execute - require approval so we can block it properly
          return true;
        default:
          return true;   // Default: require approval
      }
    },

    execute: async (input: ShellToolInput, _options: ToolExecutionOptions): Promise<ShellResult> => {
      const { command, timeout } = input;

      // Check if command is allowed first
      try {
        const args = parseCommand(command);
        if (args.length === 0) {
          return {
            stdout: '',
            stderr: 'Empty command',
            exitCode: 1,
            truncated: false,
          };
        }

        const result = matchShellRules(command, parsedConfig.rules, parsedConfig.default);

        if (result.approval === 'blocked') {
          // Throw BlockedError for the approval system
          const reason = result.matchedRule
            ? `Command blocked by rule: ${command}`
            : `Command not in whitelist (no matching rule and no default): ${command}`;
          throw new BlockedError('shell', reason);
        }
      } catch (e) {
        if (e instanceof BlockedError) {
          throw e;
        }
        if (e instanceof ShellBlockedError) {
          return {
            stdout: '',
            stderr: e.message,
            exitCode: 1,
            truncated: false,
          };
        }
        throw e;
      }

      // Execute the command
      try {
        return await executeShell(command, {
          workingDir,
          timeout,
          env,
        });
      } catch (e) {
        if (e instanceof ShellBlockedError) {
          return {
            stdout: '',
            stderr: e.message,
            exitCode: 1,
            truncated: false,
          };
        }
        throw e;
      }
    },
  };
}

// ============================================================================
// Toolset
// ============================================================================

/**
 * Options for creating a ShellToolset.
 */
export interface ShellToolsetOptions {
  /** Shell configuration with rules and default */
  config?: ShellConfig;
  /** Working directory for commands */
  workingDir?: string;
  /** Environment variables to add */
  env?: Record<string, string>;
  /** Additional approval config overrides */
  approvalConfig?: ApprovalConfig;
}

/**
 * Toolset that provides the shell tool.
 */
export class ShellToolset {
  private tools: NamedTool[];

  constructor(options: ShellToolsetOptions = {}) {
    this.tools = [createShellTool(options)];
  }

  /**
   * Get all shell tools.
   */
  getTools(): NamedTool[] {
    return this.tools;
  }
}

/**
 * Create shell tools with the given options.
 * Convenience function that returns individual tools.
 */
export function createShellTools(options: ShellToolsetOptions = {}): NamedTool[] {
  return new ShellToolset(options).getTools();
}
