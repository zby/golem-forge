/**
 * Worker Call Tool
 *
 * Platform-agnostic worker delegation toolset.
 * Enables one worker to call another worker.
 *
 * Works in both Node.js (CLI) and browser (Chrome extension).
 */

import { z } from "zod";
import type { ToolExecutionOptions } from "ai";
import type { NamedTool, ToolsetContext } from "./base.js";
import type {
  ApprovalCallback,
  ApprovalMode,
} from "../approval/index.js";
import { ApprovalController } from "../approval/index.js";
import type {
  FileOperations,
  MountSandbox,
} from "../sandbox-types.js";
import type { WorkerDefinition, WorkerSandboxConfig } from "../worker-schema.js";
import type { RuntimeUI } from "../runtime-ui.js";
import type {
  DelegationContext,
  WorkerRegistry,
  WorkerRunnerFactory,
} from "../runtime/types.js";
import type { RuntimeEventCallback } from "../runtime/events.js";
import { ToolsetRegistry } from "./registry.js";

// Re-export DelegationContext for backwards compatibility
export type { DelegationContext };

/**
 * Schema for named worker tool input (worker name is the tool name).
 */
export const NamedWorkerInputSchema = z.object({
  /** Input text for the worker */
  input: z.string().describe("Input text to send to the worker"),
  /** Optional additional instructions to extend worker's base instructions */
  instructions: z
    .string()
    .optional()
    .describe("Optional additional instructions for this call"),
  /** Sandbox file paths to read and attach (e.g., ["/doc.pdf"]) */
  attachments: z
    .array(z.string())
    .optional()
    .describe("Sandbox paths to attach as files"),
});

export type NamedWorkerInput = z.infer<typeof NamedWorkerInputSchema>;

/**
 * Options for creating the WorkerCallToolset.
 */
export interface WorkerCallToolsetOptions {
  /** Worker registry for looking up workers */
  registry: WorkerRegistry;
  /** List of worker names this worker is allowed to call */
  allowedWorkers: string[];
  /** Shared sandbox for file access */
  sandbox?: FileOperations;
  /** Approval controller to share with child workers */
  approvalController: ApprovalController;
  /** Approval callback to share with child workers */
  approvalCallback?: ApprovalCallback;
  /** Approval mode for child workers */
  approvalMode: ApprovalMode;
  /** Delegation context from parent */
  delegationContext?: DelegationContext;
  /** Program root for child worker sandbox */
  programRoot?: string;
  /** Maximum delegation depth (default: 5) */
  maxDelegationDepth?: number;
  /** Model to pass to child workers (already resolved from CLI/env/config) */
  model?: string;
  /** Factory for creating child WorkerRunner instances (required) */
  workerRunnerFactory: WorkerRunnerFactory;
  /** Event callback for runtime events (propagates to child workers) */
  onEvent?: RuntimeEventCallback;
  /** Runtime UI for event-driven UI communication (propagates to child workers) */
  runtimeUI?: RuntimeUI;
}

/**
 * Result of calling a worker.
 */
export interface CallWorkerResult {
  success: boolean;
  response?: string;
  error?: string;
  workerName: string;
  toolCallCount: number;
  tokens?: { input: number; output: number };
}

/**
 * Maximum delegation depth to prevent infinite recursion.
 */
const DEFAULT_MAX_DELEGATION_DEPTH = 5;

/**
 * Create a restricted sandbox for a child worker using mount-based restriction.
 *
 * @param parentSandbox - The parent worker's sandbox
 * @param childSandboxConfig - The child worker's sandbox restriction config
 * @param childWorkerName - Name of the child worker (for error messages)
 * @returns A restricted sandbox or the parent sandbox (if no restrictions)
 */
function createChildSandbox(
  parentSandbox: FileOperations | undefined,
  childSandboxConfig: WorkerSandboxConfig | undefined,
  childWorkerName: string
): FileOperations | undefined {
  // No parent sandbox = no child sandbox
  if (!parentSandbox) {
    if (childSandboxConfig?.restrict || childSandboxConfig?.readonly) {
      throw new Error(
        `Worker '${childWorkerName}' declares sandbox restrictions but parent has no sandbox`
      );
    }
    return undefined;
  }

  // No restrictions = full parent sandbox access
  if (!childSandboxConfig?.restrict && childSandboxConfig?.readonly === undefined) {
    return parentSandbox;
  }

  // Check if parent sandbox supports restriction (MountSandbox)
  const mountSandbox = parentSandbox as MountSandbox;
  if (typeof mountSandbox.restrict !== 'function') {
    // Parent sandbox doesn't support restriction - just pass it through
    // This allows FileOperations implementations that don't support restriction
    return parentSandbox;
  }

  // Apply restrictions using mount-based restrict()
  try {
    return mountSandbox.restrict({
      restrict: childSandboxConfig.restrict,
      readonly: childSandboxConfig.readonly,
    });
  } catch (error) {
    throw new Error(
      `Failed to restrict sandbox for worker '${childWorkerName}': ` +
      (error instanceof Error ? error.message : String(error))
    );
  }
}


/**
 * Reserved tool names that workers cannot use to avoid conflicts.
 */
const RESERVED_TOOL_NAMES = new Set([
  // Filesystem tools
  "read_file",
  "write_file",
  "list_files",
  "create_directory",
  // Common system tools
  "execute",
  "shell",
  "bash",
]);

/**
 * Check if a worker name conflicts with reserved tool names.
 */
export function checkToolNameConflict(workerName: string): boolean {
  return RESERVED_TOOL_NAMES.has(workerName);
}

/**
 * Options for executing a worker delegation.
 */
interface ExecuteDelegationOptions {
  workerName: string;
  input: string;
  instructions?: string;
  attachments?: string[];
  registry: WorkerRegistry;
  sandbox?: FileOperations;
  approvalController: ApprovalController;
  approvalCallback?: ApprovalCallback;
  approvalMode: ApprovalMode;
  delegationContext?: DelegationContext;
  programRoot?: string;
  maxDelegationDepth: number;
  /** Model to pass to child worker (already resolved) */
  model?: string;
  /** Factory for creating child WorkerRunner instances */
  workerRunnerFactory: WorkerRunnerFactory;
  /** Event callback for runtime events */
  onEvent?: RuntimeEventCallback;
  /** Runtime UI for event-driven UI communication */
  runtimeUI?: RuntimeUI;
}

/**
 * Shared logic for executing worker delegation.
 */
async function executeWorkerDelegation(
  options: ExecuteDelegationOptions
): Promise<CallWorkerResult> {
  const {
    workerName,
    input,
    instructions,
    attachments,
    registry,
    sandbox,
    approvalController,
    approvalCallback,
    approvalMode,
    delegationContext,
    programRoot,
    maxDelegationDepth,
    model,
    workerRunnerFactory,
    onEvent,
    runtimeUI,
  } = options;

  // Check delegation depth
  const currentPath = delegationContext?.delegationPath || [];
  if (currentPath.length >= maxDelegationDepth) {
    return {
      success: false,
      error: `Maximum delegation depth (${maxDelegationDepth}) exceeded. Current path: ${currentPath.join(" -> ")}`,
      workerName,
      toolCallCount: 0,
    };
  }

  // Check for circular delegation
  if (currentPath.includes(workerName)) {
    return {
      success: false,
      error: `Circular delegation detected: ${[...currentPath, workerName].join(" -> ")}`,
      workerName,
      toolCallCount: 0,
    };
  }

  // Validate that sandbox is available if attachments are requested
  if (attachments && attachments.length > 0 && !sandbox) {
    return {
      success: false,
      error: `Cannot pass attachments to worker '${workerName}': no sandbox is configured. ` +
        `Attachments require sandbox access to read files.`,
      workerName,
      toolCallCount: 0,
    };
  }

  try {
    // Look up the worker by name
    const lookupResult = await registry.get(workerName);

    if (!lookupResult.found) {
      return {
        success: false,
        error: lookupResult.error,
        workerName,
        toolCallCount: 0,
      };
    }

    const childWorker = lookupResult.worker.definition;
    const childWorkerFilePath = lookupResult.worker.filePath;

    // Model compatibility is validated by WorkerRuntime during construction

    // Read attachments from sandbox if specified
    // Note: sandbox availability is validated above when attachments are requested
    const attachmentData = attachments && attachments.length > 0
      ? await readAttachments(sandbox!, attachments)
      : [];

    // Build instructions: append dynamic instructions if provided
    let finalInstructions = childWorker.instructions;
    if (instructions) {
      finalInstructions = `${childWorker.instructions}\n\n## Additional Instructions\n\n${instructions}`;
    }

    // Create modified worker definition with updated instructions
    const modifiedWorker: WorkerDefinition = {
      ...childWorker,
      instructions: finalInstructions,
    };

    // Create restricted sandbox for child worker
    let childSandbox: FileOperations | undefined;
    try {
      childSandbox = createChildSandbox(
        sandbox,
        childWorker.sandbox,
        childWorker.name
      );
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        workerName,
        toolCallCount: 0,
      };
    }

    // Create child runtime using factory
    const childDelegationContext: DelegationContext = {
      delegationPath: [...currentPath, childWorker.name],
    };

    const childRuntime = workerRunnerFactory.create({
      worker: modifiedWorker,
      model: model,
      approvalMode: approvalMode,
      approvalCallback: approvalCallback,
      programRoot: programRoot,
      // Pass child worker's file path for custom toolset module resolution
      workerFilePath: childWorkerFilePath,
      sharedApprovalController: approvalController,
      // Pass the restricted sandbox (or undefined for pure functions)
      sharedSandbox: childSandbox,
      delegationContext: childDelegationContext,
      registry: registry,
      // Propagate event callback to child workers for nested tracing
      onEvent: onEvent,
      // Propagate runtimeUI to child workers for UI events
      runtimeUI: runtimeUI,
    });

    await childRuntime.initialize();

    // Build input with attachments
    const runInput =
      attachmentData.length > 0
        ? { content: input, attachments: attachmentData }
        : input;

    // Execute the child worker
    let result;
    try {
      result = await childRuntime.run(runInput);
    } finally {
      // Clean up child runtime resources
      await childRuntime.dispose();
    }

    return {
      success: result.success,
      response: result.response,
      error: result.error,
      workerName: childWorker.name,
      toolCallCount: result.toolCallCount,
      tokens: result.tokens,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: `Worker execution failed: ${message}`,
      workerName,
      toolCallCount: 0,
    };
  }
}

/**
 * Options for creating a named worker tool.
 */
export interface NamedWorkerToolOptions extends Omit<WorkerCallToolsetOptions, 'allowedWorkers'> {
  /** The specific worker name this tool represents */
  workerName: string;
  /** Description for the tool (from worker frontmatter) */
  workerDescription?: string;
}

/**
 * Create a named worker tool.
 *
 * The tool name IS the worker name, making it a first-class tool.
 *
 * @example
 * // greeter({ input: "Hello" })
 */
export function createNamedWorkerTool(
  options: NamedWorkerToolOptions
): NamedTool {
  const {
    workerName,
    workerDescription,
    registry,
    sandbox,
    approvalController,
    approvalCallback,
    approvalMode,
    delegationContext,
    programRoot,
    maxDelegationDepth = DEFAULT_MAX_DELEGATION_DEPTH,
    model,
    workerRunnerFactory,
    onEvent,
    runtimeUI,
  } = options;

  return {
    name: workerName,
    description: workerDescription || `Delegate task to the ${workerName} worker`,
    inputSchema: NamedWorkerInputSchema,
    needsApproval: true, // Worker calls always require approval
    execute: async (
      args: NamedWorkerInput,
      _options: ToolExecutionOptions
    ): Promise<CallWorkerResult> => {
      const { input, instructions, attachments } = args;

      return executeWorkerDelegation({
        workerName,
        input,
        instructions,
        attachments,
        registry,
        sandbox,
        approvalController,
        approvalCallback,
        approvalMode,
        delegationContext,
        programRoot,
        maxDelegationDepth,
        model,
        workerRunnerFactory,
        onEvent,
        runtimeUI,
      });
    },
  };
}

/**
 * Check if a MIME type represents binary content.
 */
function isBinaryMimeType(mimeType: string): boolean {
  return (
    mimeType.startsWith("image/") ||
    mimeType.startsWith("audio/") ||
    mimeType.startsWith("video/") ||
    mimeType === "application/pdf" ||
    mimeType === "application/octet-stream"
  );
}

/**
 * Read attachments from sandbox paths.
 * Uses Uint8Array for binary data (works in both Node.js and browser).
 *
 * @throws Error if any attachment cannot be read (permission error, not found, etc.)
 */
async function readAttachments(
  sandbox: FileOperations,
  paths: string[]
): Promise<Array<{ data: Uint8Array | string; mimeType: string; name: string }>> {
  const attachments: Array<{ data: Uint8Array | string; mimeType: string; name: string }> = [];

  for (const filePath of paths) {
    const mimeType = getMediaType(filePath);
    const name = filePath.split('/').pop() || filePath;

    if (isBinaryMimeType(mimeType)) {
      // Binary files: use readBinary and return as Uint8Array
      const binaryContent = await sandbox.readBinary(filePath);
      // Convert ArrayBuffer to Uint8Array if needed
      const uint8Data = binaryContent instanceof Uint8Array
        ? binaryContent
        : new Uint8Array(binaryContent);
      attachments.push({
        data: uint8Data,
        mimeType: mimeType,
        name,
      });
    } else {
      // Text files: use regular read
      const textContent = await sandbox.read(filePath);
      attachments.push({
        data: textContent,
        mimeType: mimeType,
        name,
      });
    }
  }

  return attachments;
}

/**
 * Get media type from file extension.
 */
function getMediaType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "txt":
    case "md":
      return "text/plain";
    case "json":
      return "application/json";
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

/**
 * Toolset for worker delegation.
 *
 * Creates named tools for each allowed worker (e.g., `greeter`, `analyzer`).
 * Worker calls ALWAYS require approval since they execute arbitrary worker code.
 */
export class WorkerCallToolset {
  private tools: NamedTool[];

  /**
   * Private constructor - use static `create` factory instead.
   */
  private constructor(tools: NamedTool[]) {
    this.tools = tools;
  }

  /**
   * Create a WorkerCallToolset with named tools for each allowed worker.
   *
   * This async factory method looks up each worker in the registry to get
   * its description, then creates a named tool for it.
   *
   * @example
   * // Creates tools: greeter, analyzer
   * const toolset = await WorkerCallToolset.create({
   *   registry,
   *   allowedWorkers: ["greeter", "analyzer"],
   *   ...
   * });
   */
  static async create(options: WorkerCallToolsetOptions): Promise<WorkerCallToolset> {
    const tools: NamedTool[] = [];

    // Create named tool for each allowed worker
    for (const workerName of options.allowedWorkers) {
      // Check for tool name conflicts with reserved names
      if (checkToolNameConflict(workerName)) {
        console.warn(
          `[WorkerCallToolset] Worker name '${workerName}' conflicts with reserved tool name. ` +
          `This may cause unexpected behavior. Consider renaming the worker.`
        );
      }

      // Try to look up worker to get its description
      let workerDescription: string | undefined;
      try {
        const lookupResult = await options.registry.get(workerName);
        if (lookupResult.found) {
          workerDescription = lookupResult.worker.definition.description;
        } else {
          // Worker not found - log warning but continue (allows lazy worker creation)
          console.warn(
            `[WorkerCallToolset] Worker '${workerName}' not found in registry at init time. ` +
            `Tool will be created but may fail at call time if worker doesn't exist.`
          );
        }
      } catch (error) {
        // Registry lookup error - log and continue
        console.warn(
          `[WorkerCallToolset] Error looking up worker '${workerName}': ${error}. ` +
          `Tool will be created but may fail at call time.`
        );
      }

      tools.push(createNamedWorkerTool({
        ...options,
        workerName,
        workerDescription,
      }));
    }

    return new WorkerCallToolset(tools);
  }

  /**
   * Get all worker tools.
   */
  getTools(): NamedTool[] {
    return this.tools;
  }
}

/**
 * Factory function for ToolsetRegistry.
 * Creates worker-call tools from context.
 *
 * Note: This factory requires additional options in context.config:
 * - allowedWorkers: string[] - list of worker names to create tools for
 * - registry: WorkerRegistry - worker registry for lookups
 * - workerRunnerFactory: WorkerRunnerFactory - factory for creating child workers
 */
export async function workerCallToolsetFactory(ctx: ToolsetContext): Promise<NamedTool[]> {
  const config = ctx.config as {
    allowedWorkers?: string[];
    registry?: WorkerRegistry;
    workerRunnerFactory?: WorkerRunnerFactory;
    approvalCallback?: ApprovalCallback;
    approvalMode?: ApprovalMode;
    delegationContext?: DelegationContext;
    programRoot?: string;
    maxDelegationDepth?: number;
    model?: string;
    onEvent?: RuntimeEventCallback;
    runtimeUI?: RuntimeUI;
  };

  if (!config.allowedWorkers || config.allowedWorkers.length === 0) {
    return [];
  }

  if (!config.registry) {
    throw new Error('WorkerCallToolset requires a registry in context.config');
  }

  if (!config.workerRunnerFactory) {
    throw new Error('WorkerCallToolset requires a workerRunnerFactory in context.config');
  }

  const toolset = await WorkerCallToolset.create({
    registry: config.registry,
    allowedWorkers: config.allowedWorkers,
    sandbox: ctx.sandbox,
    approvalController: ctx.approvalController,
    approvalCallback: config.approvalCallback,
    approvalMode: config.approvalMode || 'interactive',
    delegationContext: config.delegationContext,
    programRoot: config.programRoot || ctx.programRoot,
    maxDelegationDepth: config.maxDelegationDepth,
    model: config.model,
    workerRunnerFactory: config.workerRunnerFactory,
    onEvent: config.onEvent,
    runtimeUI: config.runtimeUI,
  });

  return toolset.getTools();
}

// Self-register with ToolsetRegistry
ToolsetRegistry.register('workers', workerCallToolsetFactory);

// ─────────────────────────────────────────────────────────────────────
// Test Helpers (internal use only)
// ─────────────────────────────────────────────────────────────────────

/** @internal Exported for testing only */
export const _internal = {
  isBinaryMimeType,
  readAttachments,
  getMediaType,
};
