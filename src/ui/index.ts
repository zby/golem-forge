/**
 * UI Abstraction Layer
 *
 * Platform-independent UI for worker execution.
 */

// Types
export type {
  ExecutionMode,
  ManualExecutionConfig,
  FieldType,
  ManualToolField,
  ManualToolInfo,
  ManualToolResult,
  ManualToolHandler,
  Message,
  WorkerInfo,
  UIApprovalRequest,
  UIApprovalResult,
  TaskStatus,
  TaskProgress,
  StatusUpdate,
  DiffContent,
  InterruptSignal,
  ToolResult,
} from "./types.js";

// Adapter interface
export type { UIAdapter } from "./adapter.js";

// CLI implementation
export {
  CLIAdapter,
  createCLIAdapter,
  type CLIAdapterOptions,
} from "./cli-adapter.js";

// Interrupt handling
export {
  createInterruptSignal,
  InterruptError,
  isInterruptError,
} from "./interrupt.js";

// Schema utilities
export {
  deriveFieldsFromSchema,
  isZodObjectSchema,
} from "./schema-to-fields.js";

// Command parsing
export {
  parseCommand,
  isCommand,
  isBuiltinCommand,
  classifyCommand,
  optionsToArgs,
  BUILTIN_COMMANDS,
  CommandParseError,
  type ParsedCommand,
  type BuiltinCommand,
  type CommandType,
} from "./command-parser.js";

// Tool info utilities
export {
  extractManualToolInfo,
  getManualTools,
  getLLMTools,
  isManualTool,
  isLLMTool,
} from "./tool-info.js";
