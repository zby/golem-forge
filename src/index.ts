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
  UIAdapter,
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
  CLIAdapterOptions,
  ParsedCommand,
  BuiltinCommand,
  CommandType,
} from "./ui/index.js";

export {
  CLIAdapter,
  createCLIAdapter,
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
  extractManualToolInfo,
  getManualTools,
  getLLMTools,
  isManualTool,
  isLLMTool,
} from "./ui/index.js";
