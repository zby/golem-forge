/**
 * Worker Execution Runtime
 *
 * Platform-agnostic worker runtime for golem-forge.
 * This module provides the core runtime components that can be used
 * by both CLI and browser extension implementations.
 */

// Re-export AI SDK types and functions that platform packages need
// Platform packages should import these from @golem-forge/core, not directly from "ai"
export type { Tool, ToolExecutionOptions, LanguageModel } from "ai";
export { streamText, generateText } from "ai";

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

// Interrupt helpers
export { createInterruptSignal, InterruptError, isInterruptError } from "./interrupt.js";

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

// Model Factory
export {
  createModelWithOptions,
  createDefaultModelFactory,
  parseModelId,
  DefaultModelFactory,
  EnvironmentAPIKeyProvider,
  type ModelFactory,
  type APIKeyProvider,
  type AIProvider,
  type ParsedModelId,
  type ProviderOptions,
} from "./model-factory.js";
