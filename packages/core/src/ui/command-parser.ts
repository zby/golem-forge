/**
 * Command Parser
 *
 * Parses slash commands from user input.
 * Commands start with `/` and are intercepted by the UI.
 */

/**
 * Parsed slash command.
 */
export interface ParsedCommand {
  /** Command name (without slash) */
  name: string;
  /** Positional arguments */
  args: string[];
  /** Named options (--key=value or --key value) */
  options: Record<string, string | boolean>;
  /** Original raw input */
  raw: string;
}

/**
 * Check if input is a slash command.
 */
export function isCommand(input: string): boolean {
  return input.startsWith("/");
}

/**
 * Check if a token looks like a negative number.
 * Returns true for tokens like "-5", "-3.14", "-.5"
 */
function isNegativeNumber(token: string): boolean {
  if (!token.startsWith("-") || token.length < 2) {
    return false;
  }
  const rest = token.slice(1);
  return /^\d*\.?\d+$/.test(rest);
}

/**
 * Check if the next token should be treated as a value (not an option).
 * A token is a value if it doesn't start with "-" OR if it's a negative number.
 */
function isValueToken(token: string): boolean {
  return !token.startsWith("-") || isNegativeNumber(token);
}

export function parseCommand(input: string): ParsedCommand | null {
  if (!isCommand(input)) {
    return null;
  }

  const raw = input;
  const trimmed = input.slice(1).trim(); // Remove leading /

  if (!trimmed) {
    return null;
  }

  const tokens = tokenize(trimmed);
  if (tokens.length === 0) {
    return null;
  }

  const name = tokens[0];
  const args: string[] = [];
  const options: Record<string, string | boolean> = {};

  let i = 1;
  while (i < tokens.length) {
    const token = tokens[i];

    if (token.startsWith("--")) {
      // Long option
      const rest = token.slice(2);

      if (rest.includes("=")) {
        // --key=value
        const [key, ...valueParts] = rest.split("=");
        options[key] = valueParts.join("=");
      } else if (i + 1 < tokens.length && isValueToken(tokens[i + 1])) {
        // --key value (including negative numbers like --count -5)
        options[rest] = tokens[i + 1];
        i++;
      } else {
        // --flag (boolean)
        options[rest] = true;
      }
    } else if (
      token.startsWith("-") &&
      token.length > 1 &&
      !token.startsWith("--") &&
      !isNegativeNumber(token)
    ) {
      // Short option (but not a negative number)
      const key = token.slice(1);

      if (key.length === 1 && i + 1 < tokens.length && isValueToken(tokens[i + 1])) {
        // -k value
        options[key] = tokens[i + 1];
        i++;
      } else {
        // -f (boolean flag) or -abc (multiple flags)
        for (const char of key) {
          options[char] = true;
        }
      }
    } else {
      // Positional argument (including negative numbers not preceded by an option)
      args.push(token);
    }

    i++;
  }

  return { name, args, options, raw };
}

/**
 * Error thrown when command parsing fails.
 */
export class CommandParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CommandParseError";
  }
}

/**
 * Tokenize a command string.
 * Handles quoted strings with spaces.
 * Throws CommandParseError for unclosed quotes.
 */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuote: string | null = null;
  let quoteStartPos = -1;
  let escape = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (escape) {
      current += char;
      escape = false;
      continue;
    }

    if (char === "\\") {
      escape = true;
      continue;
    }

    if (inQuote) {
      if (char === inQuote) {
        inQuote = null;
        quoteStartPos = -1;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inQuote = char;
      quoteStartPos = i;
      continue;
    }

    if (char === " " || char === "\t") {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (inQuote) {
    throw new CommandParseError(
      `Unclosed ${inQuote === '"' ? "double" : "single"} quote at position ${quoteStartPos}`
    );
  }

  if (escape) {
    throw new CommandParseError("Trailing backslash at end of input");
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Built-in command names.
 * These take precedence over tool names.
 */
export const BUILTIN_COMMANDS = [
  "help",
  "model",
  "clear",
  "status",
  "config",
  "exit",
  "tools",
  "tool",
  "t", // Short for /tool
  "ts", // Short for /tools
] as const;

export type BuiltinCommand = typeof BUILTIN_COMMANDS[number];

/**
 * Check if a command name is a built-in command.
 */
export function isBuiltinCommand(name: string): name is BuiltinCommand {
  return (BUILTIN_COMMANDS as readonly string[]).includes(name);
}

/**
 * Result of command classification.
 */
export type CommandType =
  | { type: "builtin"; command: BuiltinCommand; parsed: ParsedCommand }
  | { type: "tool"; toolName: string; parsed: ParsedCommand }
  | { type: "unknown"; parsed: ParsedCommand };

/**
 * Classify a parsed command.
 *
 * @param parsed - Parsed command
 * @param availableTools - List of available manual tool names
 */
export function classifyCommand(
  parsed: ParsedCommand,
  availableTools: string[]
): CommandType {
  const name = parsed.name.toLowerCase();

  // Check for /tool <name> or /t <name> syntax first
  // These are special: they look like built-ins but invoke tools
  if (name === "tool" || name === "t") {
    if (parsed.args.length > 0) {
      return { type: "tool", toolName: parsed.args[0], parsed };
    }
    // No tool name provided - this is an error case
    return { type: "unknown", parsed };
  }

  // Check for other built-in commands
  if (isBuiltinCommand(name)) {
    return { type: "builtin", command: name, parsed };
  }

  // Check for direct tool invocation: /git_push (if tool exists)
  // Use lowercase for consistent matching (tool names are case-insensitive)
  const toolNameLower = parsed.name.toLowerCase();
  const matchedTool = availableTools.find((t) => t.toLowerCase() === toolNameLower);
  if (matchedTool) {
    return { type: "tool", toolName: matchedTool, parsed };
  }

  return { type: "unknown", parsed };
}

/**
 * Convert parsed options to tool args.
 * Maps short option names to full names based on tool fields.
 *
 * @param options - Parsed options from command
 * @param fieldMapping - Map of short names to full field names
 */
export function optionsToArgs(
  options: Record<string, string | boolean>,
  fieldMapping?: Record<string, string>
): Record<string, unknown> {
  const args: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(options)) {
    const fullName = fieldMapping?.[key] || key;

    if (value === "true") {
      args[fullName] = true;
    } else if (value === "false") {
      args[fullName] = false;
    } else {
      args[fullName] = value;
    }
  }

  return args;
}

