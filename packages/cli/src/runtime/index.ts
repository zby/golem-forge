/**
 * Worker Execution Runtime
 *
 * Core runtime types and classes are in @golem-forge/core.
 * CLI-specific factory is in this package.
 */

// Re-export runtime types and classes from core
export {
  WorkerRuntime,
  createWorkerRuntime,
  defaultWorkerRunnerFactory,
  matchModelPattern,
  ToolExecutor,
  type WorkerRuntimeOptionsWithTools,
  type WorkerResult,
  type RunInput,
  type WorkerRunner,
  type WorkerRunnerFactory,
  type WorkerRunnerOptions,
  type DelegationContext,
  type ToolCall,
  type ToolExecutionContext,
  type ToolExecutionResult,
  type ToolExecutorOptions,
  type Attachment,
  type InterruptSignal,
} from "@golem-forge/core";

// Re-export event types from core
export type {
  RuntimeEvent,
  RuntimeEventData,
  RuntimeEventCallback,
  ExecutionStartEvent,
  MessageSendEvent,
  ResponseReceiveEvent,
  ToolCallStartEvent,
  ApprovalRequestEvent,
  ApprovalDecisionEvent,
  ToolCallEndEvent,
  ToolCallErrorEvent,
  ExecutionEndEvent,
  ExecutionErrorEvent,
} from "@golem-forge/core";

// CLI factory for creating runtime with injected tools
export {
  createCLIWorkerRuntime,
  defaultCLIWorkerRunnerFactory,
  type CLIWorkerRuntimeOptions,
} from "./factory.js";

// Legacy type aliases for backwards compatibility
export type { WorkerRuntimeOptionsWithTools as WorkerRuntimeOptions } from "@golem-forge/core";
