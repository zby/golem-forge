/**
 * Runtime Interfaces
 *
 * Abstractions for worker execution to enable dependency inversion
 * and improve testability.
 */

import type { Tool, LanguageModel } from "ai";
import type { ApprovalController, ApprovalCallback, ApprovalMode } from "../approval/index.js";
import type { MountSandboxConfig, FileOperations } from "../sandbox/index.js";
import type { WorkerDefinition } from "../worker/schema.js";
import type { WorkerRegistry } from "../worker/registry.js";
import type { DelegationContext } from "../tools/worker-call.js";
import type { RuntimeEventCallback } from "./events.js";
import type { Attachment } from "../ai/types.js";
import type { InterruptSignal } from "../ui/index.js";
import type { RuntimeUI } from "@golem-forge/core";

/**
 * Result of a worker execution.
 */
export interface WorkerResult {
  /** Whether execution completed successfully */
  success: boolean;
  /** Final text response from the LLM */
  response?: string;
  /** Error message if failed */
  error?: string;
  /** Number of tool calls made */
  toolCallCount: number;
  /** Token usage statistics */
  tokens?: { input: number; output: number };
  /** Total cost */
  cost?: number;
}

/**
 * Input for running a worker.
 * Can be a simple string or an object with content and optional attachments.
 */
export type RunInput =
  | string
  | {
      /** Text content */
      content: string;
      /** Optional file attachments (images, PDFs, etc.) */
      attachments?: Attachment[];
    };

/**
 * Interface for worker execution.
 *
 * Allows different implementations (local, remote, testing) to be plugged in.
 * WorkerRuntime is the primary implementation.
 */
export interface WorkerRunner {
  /**
   * Initialize the runtime (creates sandbox and registers tools).
   * Must be called before run().
   */
  initialize(): Promise<void>;

  /**
   * Execute the worker with given input.
   * Must call initialize() first.
   */
  run(input: RunInput): Promise<WorkerResult>;

  /**
   * Get the resolved model ID (for validation/tracing).
   */
  getModelId(): string;

  /**
   * Get registered tools (for inspection/validation).
   */
  getTools(): Record<string, Tool>;

  /**
   * Get the sandbox if available (for shared access in delegation).
   */
  getSandbox(): FileOperations | undefined;

  /**
   * Get the approval controller (for shared approval state).
   */
  getApprovalController(): ApprovalController;
}

/**
 * Options for creating a WorkerRunner.
 */
export interface WorkerRunnerOptions {
  /** The worker definition to execute */
  worker: WorkerDefinition;
  /** Model to use (already resolved from CLI/env/config by caller) */
  model?: string;
  /** Approval mode */
  approvalMode?: ApprovalMode;
  /** Approval callback for interactive mode */
  approvalCallback?: ApprovalCallback;
  /** Program root for CLI sandbox */
  programRoot?: string;
  /** Path to the worker file (for resolving relative module paths) */
  workerFilePath?: string;
  /** Maximum tool call iterations */
  maxIterations?: number;
  /** Inject a model directly (for testing) */
  injectedModel?: LanguageModel;
  /** Shared approval controller (for worker delegation) */
  sharedApprovalController?: ApprovalController;
  /** Shared sandbox (for worker delegation) */
  sharedSandbox?: FileOperations;
  /** Delegation context when called by another worker */
  delegationContext?: DelegationContext;
  /** Worker registry for delegation lookups */
  registry?: WorkerRegistry;
  /** Mount-based sandbox configuration (Docker-style) */
  mountSandboxConfig?: MountSandboxConfig;
  /** Create a temporary sandbox for testing (convenience option) */
  useTestSandbox?: boolean;
  /** Callback for runtime events (for tracing/debugging) */
  onEvent?: RuntimeEventCallback;
  /** Runtime UI for event-driven UI communication (optional) */
  runtimeUI?: RuntimeUI;
  /** Interrupt signal for graceful termination */
  interruptSignal?: InterruptSignal;
  /** Worker depth in the delegation tree (0 = root) */
  depth?: number;
}

/**
 * Factory interface for creating WorkerRunner instances.
 *
 * Used by WorkerCallToolset to create child workers without
 * directly depending on WorkerRuntime implementation.
 */
export interface WorkerRunnerFactory {
  /**
   * Create a new WorkerRunner instance.
   * The returned runner is not initialized - call initialize() before run().
   */
  create(options: WorkerRunnerOptions): WorkerRunner;
}
