/**
 * Key handling utilities
 *
 * Provides structured key matching similar to Gemini CLI's approach.
 */

import { useInput, type Key } from "ink";
import { useCallback } from "react";

/**
 * Key binding definition
 */
export interface KeyBinding {
  /** Key character (e.g., "y", "n") */
  key?: string;
  /** Special key name */
  name?: "return" | "escape" | "tab" | "backspace" | "delete" | "up" | "down" | "left" | "right";
  /** Require ctrl modifier */
  ctrl?: boolean;
  /** Require shift modifier */
  shift?: boolean;
  /** Require meta/cmd modifier */
  meta?: boolean;
}

/**
 * Command with key bindings
 */
export interface KeyCommand<T extends string = string> {
  name: T;
  bindings: KeyBinding[];
}

/**
 * Check if a key press matches a binding
 */
export function matchesBinding(input: string, key: Key, binding: KeyBinding): boolean {
  // Check modifiers
  if (binding.ctrl !== undefined && key.ctrl !== binding.ctrl) return false;
  if (binding.shift !== undefined && key.shift !== binding.shift) return false;
  if (binding.meta !== undefined && key.meta !== binding.meta) return false;

  // Check key character
  if (binding.key !== undefined) {
    return input.toLowerCase() === binding.key.toLowerCase();
  }

  // Check special key names
  if (binding.name !== undefined) {
    switch (binding.name) {
      case "return": return key.return;
      case "escape": return key.escape;
      case "tab": return key.tab;
      case "backspace": return key.backspace;
      case "delete": return key.delete;
      case "up": return key.upArrow;
      case "down": return key.downArrow;
      case "left": return key.leftArrow;
      case "right": return key.rightArrow;
    }
  }

  return false;
}

/**
 * Find which command matches a key press
 */
export function matchCommand<T extends string>(
  input: string,
  key: Key,
  commands: KeyCommand<T>[]
): T | null {
  for (const command of commands) {
    for (const binding of command.bindings) {
      if (matchesBinding(input, key, binding)) {
        return command.name;
      }
    }
  }
  return null;
}

/**
 * Hook for handling key commands
 */
export function useKeyCommands<T extends string>(
  commands: KeyCommand<T>[],
  handler: (command: T) => void,
  options?: { isActive?: boolean }
): void {
  const handleInput = useCallback(
    (input: string, key: Key) => {
      const matched = matchCommand(input, key, commands);
      if (matched) {
        handler(matched);
      }
    },
    [commands, handler]
  );

  useInput(handleInput, options);
}

/**
 * Common key commands for approval dialogs
 */
export const approvalCommands: KeyCommand<"approve" | "deny" | "always" | "session" | "cancel">[] = [
  { name: "approve", bindings: [{ key: "y" }, { name: "return" }] },
  { name: "deny", bindings: [{ key: "n" }] },
  { name: "always", bindings: [{ key: "a" }] },
  { name: "session", bindings: [{ key: "s" }] },
  { name: "cancel", bindings: [{ name: "escape" }] },
];

/**
 * Common key commands for navigation
 */
export const navigationCommands: KeyCommand<"up" | "down" | "left" | "right" | "select" | "cancel">[] = [
  { name: "up", bindings: [{ name: "up" }, { key: "k", ctrl: false }] },
  { name: "down", bindings: [{ name: "down" }, { key: "j", ctrl: false }] },
  { name: "left", bindings: [{ name: "left" }, { key: "h", ctrl: false }] },
  { name: "right", bindings: [{ name: "right" }, { key: "l", ctrl: false }] },
  { name: "select", bindings: [{ name: "return" }, { key: " " }] },
  { name: "cancel", bindings: [{ name: "escape" }] },
];
