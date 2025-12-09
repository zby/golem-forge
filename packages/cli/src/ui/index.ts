/**
 * UI Abstraction Layer
 *
 * Platform-independent UI for worker execution.
 * Uses event-driven architecture via UIEventBus and RuntimeUI from @golem-forge/core.
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
  // Structured tool result types
  TextResultValue,
  DiffResultValue,
  FileContentResultValue,
  FileListResultValue,
  JsonResultValue,
  ToolResultValue,
  TypedToolResult,
} from "./types.js";

// Event-based CLI implementation
export {
  EventCLIAdapter,
  createEventCLIAdapter,
  type EventCLIAdapterOptions,
} from "./event-cli-adapter.js";

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

// Diff rendering
export {
  renderDiff,
  getDiffSummary,
  type DiffRenderOptions,
} from "./diff-renderer.js";

// Result utilities
export {
  isToolResultValue,
  toTypedToolResult,
  isSuccessResult,
} from "./result-utils.js";
