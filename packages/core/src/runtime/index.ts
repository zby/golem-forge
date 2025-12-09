/**
 * Worker Execution Runtime
 *
 * Platform-agnostic worker runtime for golem-forge.
 * This module provides the core runtime components that can be used
 * by both CLI and browser extension implementations.
 */

// Types
export type {
  Attachment,
  InterruptSignal,
  DelegationContext,
  CachedWorker,
  WorkerLookupResult,
  WorkerResult,
  RunInput,
  WorkerRunner,
  WorkerRegistry,
  WorkerRunnerOptions,
  WorkerRunnerFactory,
  ToolCall,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolExecutorOptions,
} from "./types.js";

// Events
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
} from "./events.js";

// Tool Executor
export { ToolExecutor } from "./tool-executor.js";

// Worker Runtime
export {
  WorkerRuntime,
  createWorkerRuntime,
  defaultWorkerRunnerFactory,
  matchModelPattern,
  type WorkerRuntimeOptionsWithTools,
} from "./worker.js";
