/**
 * Command Parser Tests
 */

import { describe, it, expect } from "vitest";
import {
  parseCommand,
  isCommand,
  isBuiltinCommand,
  classifyCommand,
  optionsToArgs,
} from "./command-parser.js";

describe("isCommand", () => {
  it("returns true for slash commands", () => {
    expect(isCommand("/help")).toBe(true);
    expect(isCommand("/tool git_push")).toBe(true);
  });

  it("returns false for regular text", () => {
    expect(isCommand("hello")).toBe(false);
    expect(isCommand("")).toBe(false);
    expect(isCommand("/ space")).toBe(true); // Still starts with /
  });
});

describe("parseCommand", () => {
  it("parses simple commands", () => {
    const result = parseCommand("/help");
    expect(result).toEqual({
      name: "help",
      args: [],
      options: {},
      raw: "/help",
    });
  });

  it("parses commands with positional args", () => {
    const result = parseCommand("/tool git_push");
    expect(result).toEqual({
      name: "tool",
      args: ["git_push"],
      options: {},
      raw: "/tool git_push",
    });
  });

  it("parses long options with values", () => {
    const result = parseCommand("/tool git_push --branch main");
    expect(result).toEqual({
      name: "tool",
      args: ["git_push"],
      options: { branch: "main" },
      raw: "/tool git_push --branch main",
    });
  });

  it("parses --key=value syntax", () => {
    const result = parseCommand("/tool git_push --branch=main --force");
    expect(result).toEqual({
      name: "tool",
      args: ["git_push"],
      options: { branch: "main", force: true },
      raw: "/tool git_push --branch=main --force",
    });
  });

  it("parses short options", () => {
    const result = parseCommand("/tool git_push -b main -f");
    expect(result).toEqual({
      name: "tool",
      args: ["git_push"],
      options: { b: "main", f: true },
      raw: "/tool git_push -b main -f",
    });
  });

  it("parses combined short options", () => {
    const result = parseCommand("/tool git_push -abc");
    expect(result).toEqual({
      name: "tool",
      args: ["git_push"],
      options: { a: true, b: true, c: true },
      raw: "/tool git_push -abc",
    });
  });

  it("handles quoted strings with spaces", () => {
    const result = parseCommand('/tool commit --message "hello world"');
    expect(result).toEqual({
      name: "tool",
      args: ["commit"],
      options: { message: "hello world" },
      raw: '/tool commit --message "hello world"',
    });
  });

  it("handles escaped quotes", () => {
    const result = parseCommand("/tool commit --message 'it\\'s fine'");
    expect(result).toEqual({
      name: "tool",
      args: ["commit"],
      options: { message: "it's fine" },
      raw: "/tool commit --message 'it\\'s fine'",
    });
  });

  it("returns null for empty command", () => {
    expect(parseCommand("/")).toBe(null);
    expect(parseCommand("/  ")).toBe(null);
  });

  it("returns null for non-commands", () => {
    expect(parseCommand("hello")).toBe(null);
  });
});

describe("isBuiltinCommand", () => {
  it("recognizes built-in commands", () => {
    expect(isBuiltinCommand("help")).toBe(true);
    expect(isBuiltinCommand("model")).toBe(true);
    expect(isBuiltinCommand("clear")).toBe(true);
    expect(isBuiltinCommand("status")).toBe(true);
    expect(isBuiltinCommand("config")).toBe(true);
    expect(isBuiltinCommand("exit")).toBe(true);
    expect(isBuiltinCommand("tools")).toBe(true);
    expect(isBuiltinCommand("tool")).toBe(true);
    expect(isBuiltinCommand("t")).toBe(true);
    expect(isBuiltinCommand("ts")).toBe(true);
  });

  it("rejects non-built-in commands", () => {
    expect(isBuiltinCommand("git_push")).toBe(false);
    expect(isBuiltinCommand("custom")).toBe(false);
  });
});

describe("classifyCommand", () => {
  const availableTools = ["git_push", "git_status", "deploy"];

  it("classifies built-in commands", () => {
    const parsed = parseCommand("/help")!;
    const result = classifyCommand(parsed, availableTools);
    expect(result).toEqual({
      type: "builtin",
      command: "help",
      parsed,
    });
  });

  it("classifies tool commands via /tool", () => {
    const parsed = parseCommand("/tool git_push --branch main")!;
    const result = classifyCommand(parsed, availableTools);
    expect(result).toEqual({
      type: "tool",
      toolName: "git_push",
      parsed,
    });
  });

  it("classifies tool commands via /t shorthand", () => {
    const parsed = parseCommand("/t git_push")!;
    const result = classifyCommand(parsed, availableTools);
    expect(result).toEqual({
      type: "tool",
      toolName: "git_push",
      parsed,
    });
  });

  it("classifies direct tool invocation", () => {
    const parsed = parseCommand("/git_push --branch main")!;
    const result = classifyCommand(parsed, availableTools);
    expect(result).toEqual({
      type: "tool",
      toolName: "git_push",
      parsed,
    });
  });

  it("returns unknown for unrecognized commands", () => {
    const parsed = parseCommand("/unknown_command")!;
    const result = classifyCommand(parsed, availableTools);
    expect(result).toEqual({
      type: "unknown",
      parsed,
    });
  });

  it("returns unknown for /tool without args", () => {
    const parsed = parseCommand("/tool")!;
    const result = classifyCommand(parsed, availableTools);
    expect(result).toEqual({
      type: "unknown",
      parsed,
    });
  });
});

describe("optionsToArgs", () => {
  it("converts options to args", () => {
    const result = optionsToArgs({
      branch: "main",
      force: true,
    });
    expect(result).toEqual({
      branch: "main",
      force: true,
    });
  });

  it("converts string 'true'/'false' to boolean", () => {
    const result = optionsToArgs({
      enabled: "true",
      disabled: "false",
    });
    expect(result).toEqual({
      enabled: true,
      disabled: false,
    });
  });

  it("maps short names to full names", () => {
    const result = optionsToArgs(
      { b: "main", f: true },
      { b: "branch", f: "force" }
    );
    expect(result).toEqual({
      branch: "main",
      force: true,
    });
  });
});
