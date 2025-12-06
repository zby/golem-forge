/**
 * Worker Call Tool
 *
 * Enables worker delegation - one worker calling another.
 */

import { z } from "zod";
import type { ToolExecutionOptions } from "ai";
import type { NamedTool } from "./filesystem.js";
import type { ApprovalCallback, ApprovalMode } from "../approval/index.js";
import { ApprovalController } from "../approval/index.js";
import type { Sandbox, ZoneAccessMode } from "../sandbox/index.js";
import { createRestrictedSandbox } from "../sandbox/index.js";
import { WorkerRegistry } from "../worker/registry.js";
import type { WorkerDefinition, WorkerSandboxConfig } from "../worker/schema.js";

/**
 * Schema for call_worker tool input (generic fallback).
 */
export const CallWorkerInputSchema = z.object({
  /** Worker name (must be in the allowed_workers list) */
  worker: z
    .string()
    .describe("Name of the worker to invoke (must be in allowed_workers list)"),
  /** Input text for the worker */
  input: z.string().describe("Input text to send to the worker"),
  /** Optional additional instructions to extend worker's base instructions */
  instructions: z
    .string()
    .optional()
    .describe("Optional additional instructions for this call"),
  /** Sandbox file paths to read and attach (e.g., ["/workspace/doc.pdf"]) */
  attachments: z
    .array(z.string())
    .optional()
    .describe("Sandbox paths to attach as files"),
});

export type CallWorkerInput = z.infer<typeof CallWorkerInputSchema>;

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
  /** Sandbox file paths to read and attach (e.g., ["/workspace/doc.pdf"]) */
  attachments: z
    .array(z.string())
    .optional()
    .describe("Sandbox paths to attach as files"),
});

export type NamedWorkerInput = z.infer<typeof NamedWorkerInputSchema>;

/**
 * Context for worker delegation - tracks the call chain.
 */
export interface DelegationContext {
  /** Chain of worker names from root to current (e.g., ["orchestrator", "analyzer"]) */
  delegationPath: string[];
}

/**
 * Options for creating the WorkerCallToolset.
 */
export interface WorkerCallToolsetOptions {
  /** Worker registry for looking up workers */
  registry: WorkerRegistry;
  /** List of worker names this worker is allowed to call */
  allowedWorkers: string[];
  /** Shared sandbox for file access */
  sandbox?: Sandbox;
  /** Approval controller to share with child workers */
  approvalController: ApprovalController;
  /** Approval callback to share with child workers */
  approvalCallback?: ApprovalCallback;
  /** Approval mode for child workers */
  approvalMode: ApprovalMode;
  /** Delegation context from parent */
  delegationContext?: DelegationContext;
  /** Project root for child worker sandbox */
  projectRoot?: string;
  /** Maximum delegation depth (default: 5) */
  maxDelegationDepth?: number;
  /** Model to pass to child workers (already resolved from CLI/env/config) */
  model?: string;
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
 * Create a restricted sandbox for a child worker.
 *
 * Validates the child's sandbox requirements against the parent's access
 * and returns a sandbox that only allows what the child declared.
 *
 * @param parentSandbox - The parent worker's sandbox
 * @param childSandboxConfig - The child worker's sandbox declaration
 * @param childWorkerName - Name of the child worker (for error messages)
 * @returns A restricted sandbox or null (pure function)
 */
function createChildSandbox(
  parentSandbox: Sandbox | undefined,
  childSandboxConfig: WorkerSandboxConfig | undefined,
  childWorkerName: string
): Sandbox | null {
  // No declaration = pure function (no sandbox)
  if (!childSandboxConfig?.zones?.length) {
    return null;
  }

  // Child declared zones but parent has no sandbox - error
  if (!parentSandbox) {
    throw new Error(
      `Worker '${childWorkerName}' declares sandbox requirements but parent has no sandbox`
    );
  }

  // Build allowed zones map, validating against parent's access
  const allowedZones = new Map<string, ZoneAccessMode>();

  for (const zoneReq of childSandboxConfig.zones) {
    const zoneName = zoneReq.name;
    const requestedMode = zoneReq.mode ?? 'rw';
    const parentAccess = parentSandbox.getZoneAccess(zoneName);

    // Check that parent has access to this zone
    if (!parentAccess) {
      throw new Error(
        `Worker '${childWorkerName}' requests zone '${zoneName}' but parent doesn't have it. ` +
        `Available zones: ${parentSandbox.getAvailableZones().join(', ') || 'none'}`
      );
    }

    // Check that child's requested mode doesn't exceed parent's access
    if (requestedMode === 'rw' && parentAccess === 'ro') {
      throw new Error(
        `Worker '${childWorkerName}' requests 'rw' access to zone '${zoneName}' ` +
        `but parent only has 'ro' access`
      );
    }

    allowedZones.set(zoneName, requestedMode);
  }

  return createRestrictedSandbox(parentSandbox, allowedZones);
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
  // Worker tools
  "call_worker",
  "worker_create",
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
  sandbox?: Sandbox;
  approvalController: ApprovalController;
  approvalCallback?: ApprovalCallback;
  approvalMode: ApprovalMode;
  delegationContext?: DelegationContext;
  projectRoot?: string;
  maxDelegationDepth: number;
  /** Model to pass to child worker (already resolved) */
  model?: string;
}

/**
 * Shared logic for executing worker delegation.
 *
 * Used by both createCallWorkerTool and createNamedWorkerTool to ensure
 * consistent behavior across both delegation patterns.
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
    projectRoot,
    maxDelegationDepth,
    model,
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

    // Model compatibility is validated by WorkerRuntime during construction

    // Read attachments from sandbox if specified
    const attachmentData = await readAttachments(sandbox, attachments);

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
    // This enforces the child worker's sandbox declaration
    let childSandbox: Sandbox | null | undefined;
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

    // Create child runtime
    // Import WorkerRuntime dynamically to avoid circular dependency
    const { WorkerRuntime } = await import("../runtime/worker.js");

    const childDelegationContext: DelegationContext = {
      delegationPath: [...currentPath, childWorker.name],
    };

    const childRuntime = new WorkerRuntime({
      worker: modifiedWorker,
      model: model,
      approvalMode: approvalMode,
      approvalCallback: approvalCallback,
      projectRoot: projectRoot,
      sharedApprovalController: approvalController,
      // Pass the restricted sandbox (or undefined for pure functions)
      sharedSandbox: childSandbox ?? undefined,
      delegationContext: childDelegationContext,
      registry: registry,
    });

    await childRuntime.initialize();

    // Build input with attachments
    const runInput =
      attachmentData.length > 0
        ? { content: input, attachments: attachmentData }
        : input;

    // Execute the child worker
    const result = await childRuntime.run(runInput);

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
 * Create the call_worker tool.
 *
 * This tool enables workers to delegate to other workers.
 * It handles:
 * - Worker lookup by name (must be in allowed_workers list)
 * - Model configuration passing to child workers
 * - Attachment passing from sandbox
 * - Shared approval controller
 */
export function createCallWorkerTool(
  options: WorkerCallToolsetOptions
): NamedTool {
  const {
    registry,
    allowedWorkers,
    sandbox,
    approvalController,
    approvalCallback,
    approvalMode,
    delegationContext,
    projectRoot,
    maxDelegationDepth = DEFAULT_MAX_DELEGATION_DEPTH,
    model,
  } = options;

  return {
    name: "call_worker",
    description:
      `Call another worker to perform a task. Allowed workers: ${allowedWorkers.join(", ")}`,
    inputSchema: CallWorkerInputSchema,
    needsApproval: true, // Worker calls always require approval
    execute: async (
      args: CallWorkerInput,
      _options: ToolExecutionOptions
    ): Promise<CallWorkerResult> => {
      const { worker: workerName, input, instructions, attachments } = args;

      // Validate worker is in allowed list
      if (!allowedWorkers.includes(workerName)) {
        return {
          success: false,
          error: `Worker '${workerName}' is not in the allowed workers list. Allowed: ${allowedWorkers.join(", ")}`,
          workerName,
          toolCallCount: 0,
        };
      }

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
        projectRoot,
        maxDelegationDepth,
        model,
      });
    },
  };
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
 * Unlike call_worker, this tool is named after the worker itself.
 * The tool name IS the worker name, making it a first-class tool.
 *
 * @example
 * // Instead of: call_worker({ worker: "greeter", input: "Hello" })
 * // The LLM calls: greeter({ input: "Hello" })
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
    projectRoot,
    maxDelegationDepth = DEFAULT_MAX_DELEGATION_DEPTH,
    model,
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
        projectRoot,
        maxDelegationDepth,
        model,
      });
    },
  };
}

/**
 * Read attachments from sandbox paths.
 */
async function readAttachments(
  sandbox: Sandbox | undefined,
  paths: string[] | undefined
): Promise<Array<{ data: string; mimeType: string }>> {
  if (!sandbox || !paths || paths.length === 0) {
    return [];
  }

  const attachments: Array<{ data: string; mimeType: string }> = [];

  for (const filePath of paths) {
    try {
      const content = await sandbox.read(filePath);
      const mimeType = getMediaType(filePath);
      // For binary files, we'd need to base64 encode, but sandbox.read returns string
      // For now, assume text-based content
      attachments.push({
        data: content,
        mimeType: mimeType,
      });
    } catch (error) {
      // Skip files that can't be read
      console.warn(`Could not read attachment ${filePath}: ${error}`);
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
 * Creates named tools for each allowed worker (e.g., `greeter`, `analyzer`)
 * plus keeps `call_worker` as a fallback for dynamic cases.
 *
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
   * its description, then creates a named tool for it. The `call_worker`
   * tool is also included as a fallback for dynamic worker discovery.
   *
   * @example
   * // Creates tools: greeter, analyzer, call_worker
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

    // Add call_worker as fallback for dynamic cases
    tools.push(createCallWorkerTool(options));

    return new WorkerCallToolset(tools);
  }

  /**
   * Create a WorkerCallToolset synchronously (legacy, only includes call_worker).
   *
   * @deprecated Use `WorkerCallToolset.create()` instead for named worker tools.
   */
  static createSync(options: WorkerCallToolsetOptions): WorkerCallToolset {
    return new WorkerCallToolset([createCallWorkerTool(options)]);
  }

  /**
   * Get all worker tools.
   */
  getTools(): NamedTool[] {
    return this.tools;
  }
}
