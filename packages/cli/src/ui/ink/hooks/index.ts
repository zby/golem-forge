/**
 * Hooks exports for Ink UI
 */

export {
  useTerminalSize,
  useIsNarrow,
  useAvailableWidth,
  type TerminalSize,
} from "./useTerminalSize.js";

export {
  useKeyCommands,
  matchesBinding,
  matchCommand,
  approvalCommands,
  navigationCommands,
  type KeyBinding,
  type KeyCommand,
} from "./useKeyHandler.js";
