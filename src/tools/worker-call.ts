/**
 * Worker Call Tool
 *
 * Enables worker delegation - one worker calling another.
 */

import { z } from "zod";
import type { ToolExecutionOptions } from "ai";
import type { NamedTool } from "./filesystem.js";
import type {
  SupportsNeedsApproval,
  SupportsApprovalDescription,
  ApprovalCallback,
  ApprovalMode,
} from "../approval/index.js";
import { ApprovalController } from "../approval/index.js";
import type { Sandbox } from "../sandbox/index.js";
import { WorkerRegistry } from "../worker/registry.js";
import type { WorkerDefinition } from "../worker/schema.js";

/**
 * Schema for call_worker tool input.
 */
export const CallWorkerInputSchema = z.object({
  /** Worker name or relative path (e.g., "analyzer" or "./helpers/analyzer.worker") */
  worker: z
    .string()
    .describe(
      'Worker name or path to invoke (e.g., "analyzer" or "./helpers/analyzer.worker")'
    ),
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
 * Context for worker delegation - tracks the call chain.
 */
export interface DelegationContext {
  /** Chain of worker names from root to current (e.g., ["orchestrator", "analyzer"]) */
  delegationPath: string[];
  /** The resolved model being used by the parent (for inheritance) */
  callerModel: string;
  /** Reference to caller's worker file path (for relative resolution) */
  callerWorkerPath?: string;
}

/**
 * Options for creating the WorkerCallToolset.
 */
export interface WorkerCallToolsetOptions {
  /** Worker registry for looking up workers */
  registry: WorkerRegistry;
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
 * Create the call_worker tool.
 *
 * This tool enables workers to delegate to other workers.
 * It handles:
 * - Worker lookup by name or relative path
 * - Model inheritance from caller
 * - Attachment passing from sandbox
 * - Shared approval controller
 */
export function createCallWorkerTool(
  options: WorkerCallToolsetOptions
): NamedTool {
  const {
    registry,
    sandbox,
    approvalController,
    approvalCallback,
    approvalMode,
    delegationContext,
    projectRoot,
    maxDelegationDepth = DEFAULT_MAX_DELEGATION_DEPTH,
  } = options;

  return {
    name: "call_worker",
    description:
      "Call another worker to perform a task. Use this when the task is better suited for a specialized worker.",
    inputSchema: CallWorkerInputSchema,
    execute: async (
      args: CallWorkerInput,
      _options: ToolExecutionOptions
    ): Promise<CallWorkerResult> => {
      const { worker: workerRef, input, instructions, attachments } = args;

      // Check delegation depth
      const currentPath = delegationContext?.delegationPath || [];
      if (currentPath.length >= maxDelegationDepth) {
        return {
          success: false,
          error: `Maximum delegation depth (${maxDelegationDepth}) exceeded. Current path: ${currentPath.join(" -> ")}`,
          workerName: workerRef,
          toolCallCount: 0,
        };
      }

      // Check for circular delegation
      if (currentPath.includes(workerRef)) {
        return {
          success: false,
          error: `Circular delegation detected: ${[...currentPath, workerRef].join(" -> ")}`,
          workerName: workerRef,
          toolCallCount: 0,
        };
      }

      try {
        // Look up the worker
        const callerPath = delegationContext?.callerWorkerPath;
        const lookupResult = callerPath
          ? await registry.getRelativeTo(workerRef, callerPath)
          : await registry.get(workerRef);

        if (!lookupResult.found) {
          return {
            success: false,
            error: lookupResult.error,
            workerName: workerRef,
            toolCallCount: 0,
          };
        }

        const childWorker = lookupResult.worker.definition;
        const childWorkerPath = lookupResult.worker.filePath;

        // Validate model compatibility if we have a caller model
        const callerModel = delegationContext?.callerModel;
        if (callerModel && childWorker.compatible_models !== undefined) {
          const isCompatible = checkModelCompatibility(
            callerModel,
            childWorker.compatible_models
          );
          if (!isCompatible) {
            return {
              success: false,
              error: `Model '${callerModel}' is not compatible with worker '${childWorker.name}'. Compatible models: ${childWorker.compatible_models.join(", ")}`,
              workerName: workerRef,
              toolCallCount: 0,
            };
          }
        }

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

        // Create child runtime options
        // Import WorkerRuntime dynamically to avoid circular dependency
        const { WorkerRuntime } = await import("../runtime/worker.js");

        const childDelegationContext: DelegationContext = {
          delegationPath: [...currentPath, childWorker.name],
          callerModel: callerModel || "anthropic:claude-haiku-4-5",
          callerWorkerPath: childWorkerPath,
        };

        const childRuntime = new WorkerRuntime({
          worker: modifiedWorker,
          callerModel: callerModel,
          approvalMode: approvalMode,
          approvalCallback: approvalCallback,
          projectRoot: projectRoot,
          // Pass shared resources
          sharedApprovalController: approvalController,
          sharedSandbox: sandbox,
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
        const message =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Worker execution failed: ${message}`,
          workerName: workerRef,
          toolCallCount: 0,
        };
      }
    },
  };
}

/**
 * Check if a model matches any pattern in compatible_models.
 */
function checkModelCompatibility(
  modelId: string,
  compatibleModels: string[]
): boolean {
  for (const pattern of compatibleModels) {
    if (matchModelPattern(modelId, pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Match a model ID against a glob pattern.
 */
function matchModelPattern(modelId: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*");
  const regex = new RegExp(`^${regexPattern}$`);
  return regex.test(modelId);
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
 * Provides the call_worker tool and implements approval logic.
 * Worker calls ALWAYS require approval since they execute arbitrary worker code.
 */
export class WorkerCallToolset
  implements SupportsNeedsApproval<unknown>, SupportsApprovalDescription<unknown>
{
  private tools: NamedTool[];
  private delegationContext?: DelegationContext;

  constructor(options: WorkerCallToolsetOptions) {
    this.delegationContext = options.delegationContext;
    this.tools = [createCallWorkerTool(options)];
  }

  /**
   * Get all worker tools.
   */
  getTools(): NamedTool[] {
    return this.tools;
  }

  /**
   * Worker calls always require approval.
   */
  needsApproval(_name: string, _args: Record<string, unknown>): boolean {
    // Always require approval for call_worker
    return true;
  }

  /**
   * Get a human-readable description for approval prompts.
   */
  getApprovalDescription(
    name: string,
    args: Record<string, unknown>
  ): string {
    if (name === "call_worker") {
      const workerName = args.worker as string;
      const input = args.input as string;
      const instructions = args.instructions as string | undefined;

      // Truncate long inputs
      const inputPreview =
        input.length > 80 ? input.substring(0, 80) + "..." : input;

      // Build description with delegation path if present
      const pathPrefix =
        this.delegationContext?.delegationPath.length
          ? `${this.delegationContext.delegationPath.join(" -> ")} -> `
          : "";

      let description = `${pathPrefix}Call worker "${workerName}"`;
      if (instructions) {
        description += " (with custom instructions)";
      }
      description += `\nInput: ${inputPreview}`;

      return description;
    }

    return `Execute ${name}`;
  }
}
