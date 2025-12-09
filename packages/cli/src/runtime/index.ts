/**
 * Worker Execution Runtime
 *
 * Core runtime types are in @golem-forge/core.
 * CLI-specific implementations are in this package.
 */

// Re-export types from core for convenience
export type {
  RuntimeEvent as CoreRuntimeEvent,
  RuntimeEventData as CoreRuntimeEventData,
  RuntimeEventCallback as CoreRuntimeEventCallback,
  WorkerRegistry as CoreWorkerRegistry,
  Attachment as CoreAttachment,
} from "@golem-forge/core";

// CLI-specific implementations
export {
  WorkerRuntime,
  createWorkerRuntime,
  defaultWorkerRunnerFactory,
  matchModelPattern,
  type WorkerResult,
  type RunInput,
  type WorkerRuntimeOptions,
} from "./worker.js";

export type {
  WorkerRunner,
  WorkerRunnerFactory,
  WorkerRunnerOptions,
  DelegationContext,
  RuntimeEventCallback,
} from "./interfaces.js";

// Events re-exported from core
export type {
  RuntimeEvent,
  RuntimeEventData,
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

export { ToolExecutor, type ToolCall } from "./tool-executor.js";

// Re-export Attachment from ai/types for backwards compatibility
export type { Attachment } from "../ai/types.js";

// Re-export InterruptSignal from ui
export type { InterruptSignal } from "../ui/index.js";
