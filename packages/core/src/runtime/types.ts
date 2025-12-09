/**
 * Runtime Types
 *
 * Core type definitions for the worker runtime system.
 */

import type { Tool, LanguageModel } from "ai";
import type { ApprovalController, ApprovalCallback, ApprovalMode } from "../approval/index.js";
import type { MountSandboxConfig, FileOperations } from "../sandbox-types.js";
import type { WorkerDefinition } from "../worker-schema.js";
import type { RuntimeEventCallback } from "./events.js";
import type { RuntimeUI } from "../runtime-ui.js";

/**
 * Binary data type that works in both Node.js and browser.
 * Buffer extends Uint8Array, so this type accepts both.
 */
export type BinaryData = ArrayBuffer | Uint8Array | string;

/**
 * Attachment for multimodal inputs.
 * Compatible with both our interface and Vercel AI SDK's file format.
 * The data can be:
 * - Node.js Buffer (extends Uint8Array, so compatible)
 * - ArrayBuffer or Uint8Array (browser)
 * - base64-encoded string
 */
export interface Attachment {
  /** MIME type of the attachment */
  mimeType: string;
  /** File data as Buffer, ArrayBuffer, Uint8Array, or base64 string */
  data: BinaryData;
  /** Optional file name */
  name?: string;
}

/**
 * Interrupt signal checked by tool loop.
 */
export interface InterruptSignal {
  /** Whether interrupted */
  interrupted: boolean;
  /** Trigger an interrupt */
  interrupt(): void;
  /** Reset the signal */
  reset(): void;
}

/**
 * Context for worker delegation chains.
 */
export interface DelegationContext {
  /** Chain of worker names from root to current (e.g., ["orchestrator", "analyzer"]) */
  delegationPath: string[];
  /** Maximum delegation depth allowed */
  maxDepth?: number;
}

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

  /**
   * Clean up resources (UI subscriptions, etc.).
   * Should be called after run() completes.
   */
  dispose(): Promise<void>;
}

/**
 * Cached worker entry with metadata.
 * Used by WorkerRegistry implementations.
 */
export interface CachedWorker {
  /** Path to the worker file (absolute in CLI, virtual in browser) */
  filePath: string;
  /** Parsed worker definition */
  definition: WorkerDefinition;
  /** File modification time when cached (optional for browser) */
  mtime?: number;
}

/**
 * Result of looking up a worker.
 */
export type WorkerLookupResult =
  | { found: true; worker: CachedWorker }
  | { found: false; error: string };

/**
 * Registry for looking up workers by name.
 * This is an interface that platforms implement.
 * Different platforms (CLI, browser) have different implementations.
 */
export interface WorkerRegistry {
  /**
   * Look up a worker by name or path.
   * This is the primary method used by WorkerCallToolset.
   */
  get(nameOrPath: string): Promise<WorkerLookupResult>;

  /**
   * Add a path to search for workers (optional, CLI-specific).
   */
  addSearchPath?(path: string): void;
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

/**
 * A tool call to be executed.
 */
export interface ToolCall {
  toolCallId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
}

/**
 * Context for tool execution.
 */
export interface ToolExecutionContext {
  /** Full message history (some tools may need it) */
  messages: unknown[];
  /** Current iteration number (1-based) */
  iteration: number;
}

/**
 * Result of executing a tool.
 */
export interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  /** The tool output (can be any JSON-serializable value) */
  output: unknown;
  /** Whether the output is an error */
  isError: boolean;
  /** How long execution took */
  durationMs: number;
}

/**
 * Options for creating a ToolExecutor.
 */
export interface ToolExecutorOptions {
  /** Registry of available tools */
  tools: Record<string, Tool>;
  /** Controller for approval decisions */
  approvalController: ApprovalController;
  /** Optional event callback for observability */
  onEvent?: RuntimeEventCallback;
  /** Optional RuntimeUI for event-driven UI communication */
  runtimeUI?: RuntimeUI;
}
