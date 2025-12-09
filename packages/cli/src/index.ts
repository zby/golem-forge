/**
 * golem-forge - Build composable LLM workflows using workers
 */

// Approval system
export * from "./approval/index.js";

// Tool execution with approval
export * from "./tools/index.js";

// Worker definitions
export * from "./worker/index.js";

// UI abstraction layer (selective exports to avoid conflicts)
export type {
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
  InkAdapterOptions,
  ParsedCommand,
  BuiltinCommand,
  CommandType,
  // Structured tool result types
  TextResultValue,
  DiffResultValue,
  FileContentResultValue,
  FileListResultValue,
  JsonResultValue,
  ToolResultValue,
  TypedToolResult,
  DiffRenderOptions,
} from "./ui/index.js";

export {
  InkAdapter,
  createInkAdapter,
  createInterruptSignal,
  InterruptError,
  isInterruptError,
  deriveFieldsFromSchema,
  isZodObjectSchema,
  parseCommand as parseUICommand,  // Renamed to avoid conflict with shell.parseCommand
  isCommand,
  isBuiltinCommand,
  classifyCommand,
  optionsToArgs,
  BUILTIN_COMMANDS,
  CommandParseError,
  extractManualToolInfo,
  getManualTools,
  getLLMTools,
  isManualTool,
  isLLMTool,
  // Diff rendering
  renderDiff,
  getDiffSummary,
  // Result utilities
  isToolResultValue,
  toTypedToolResult,
  isSuccessResult,
} from "./ui/index.js";
