/**
 * CLI Worker Runtime Factory
 *
 * Creates WorkerRuntime instances with CLI-specific tools injected.
 * Uses Core's WorkerRuntime with platform-specific toolsets (filesystem, workers, custom).
 */

import * as path from "path";
import type { Tool } from "@golem-forge/core";
import type { WorkerDefinition } from "../worker/schema.js";
import { ApprovalController } from "../approval/index.js";
import {
  createCustomToolset,
  CustomToolsetConfigSchema,
  ToolsetRegistry,
  type CustomToolsetConfig,
} from "../tools/index.js";
import {
  WorkerCallToolset,
  WorkerRuntime as CoreWorkerRuntime,
  createWorkerRuntime as createCoreWorkerRuntime,
  type WorkerRunnerFactory,
  type WorkerRunner,
  type NamedTool,
  type FileOperations,
  type RuntimeUI,
  type RuntimeEventCallback,
  type WorkerRunnerOptions,
  type WorkerResult,
  type RunInput,
} from "@golem-forge/core";
import { WorkerRegistry } from "../worker/registry.js";
import {
  createMountSandboxAsync,
  createTestSandbox,
  type MountSandboxConfig,
} from "../sandbox/index.js";

// Re-export types
export type { WorkerResult, RunInput, WorkerRunnerOptions };

/**
 * CLI Worker Runner - implements WorkerRunner interface with lazy initialization.
 *
 * This wrapper class allows the synchronous WorkerRunnerFactory.create() to return
 * an uninitialized runner, which then performs async tool injection during initialize().
 * This ensures delegated workers get their full toolset (filesystem, workers, custom, etc.).
 */
class CLIWorkerRunner implements WorkerRunner {
  private options: CLIWorkerRuntimeOptions;
  private registry: WorkerRegistry;
  private runtime?: CoreWorkerRuntime;

  constructor(options: CLIWorkerRuntimeOptions, registry: WorkerRegistry) {
    this.options = options;
    this.registry = registry;
  }

  async initialize(): Promise<void> {
    // Create the runtime with proper tool injection
    this.runtime = await createCLIWorkerRuntime({
      ...this.options,
      registry: this.registry,
    });
  }

  async run(input: RunInput): Promise<WorkerResult> {
    if (!this.runtime) {
      throw new Error("CLIWorkerRunner not initialized. Call initialize() first.");
    }
    return this.runtime.run(input);
  }

  getModelId(): string {
    if (!this.runtime) {
      throw new Error("CLIWorkerRunner not initialized. Call initialize() first.");
    }
    return this.runtime.getModelId();
  }

  getTools(): Record<string, Tool> {
    if (!this.runtime) {
      return {};
    }
    return this.runtime.getTools();
  }

  getSandbox(): FileOperations | undefined {
    return this.runtime?.getSandbox();
  }

  getApprovalController(): ApprovalController {
    if (!this.runtime) {
      throw new Error("CLIWorkerRunner not initialized. Call initialize() first.");
    }
    return this.runtime.getApprovalController() as ApprovalController;
  }

  async dispose(): Promise<void> {
    if (this.runtime) {
      await this.runtime.dispose();
    }
  }
}

/**
 * CLI-specific options for creating WorkerRuntime.
 */
export interface CLIWorkerRuntimeOptions extends WorkerRunnerOptions {
  /** Worker registry for worker delegation */
  registry?: WorkerRegistry;
  /** Path to the worker file (for resolving relative paths) */
  workerFilePath?: string;
  /** Program root directory */
  programRoot?: string;
  /** Mount sandbox configuration */
  mountSandboxConfig?: MountSandboxConfig;
  /** Use test sandbox (temporary directory) */
  useTestSandbox?: boolean;
  /** Share sandbox from parent (for delegation) */
  sharedSandbox?: FileOperations;
}

/**
 * Create sandbox based on options.
 */
async function createSandbox(options: CLIWorkerRuntimeOptions): Promise<FileOperations | undefined> {
  // Use shared sandbox (for delegation)
  if (options.sharedSandbox) {
    return options.sharedSandbox;
  }

  // Mount-based sandbox (Docker-style)
  if (options.mountSandboxConfig) {
    return await createMountSandboxAsync(options.mountSandboxConfig);
  }

  // Create temp sandbox for testing
  if (options.useTestSandbox) {
    return await createTestSandbox();
  }

  return undefined;
}

/**
 * Create tools from worker configuration.
 * Handles filesystem, workers, custom, and dynamic registry toolsets.
 */
async function createTools(
  worker: WorkerDefinition,
  options: CLIWorkerRuntimeOptions,
  sandbox: FileOperations | undefined,
  approvalController: ApprovalController,
  onEvent?: RuntimeEventCallback,
  runtimeUI?: RuntimeUI
): Promise<Record<string, Tool>> {
  const tools: Record<string, Tool> = {};
  const toolsetsConfig = worker.toolsets || {};

  for (const [toolsetName, toolsetConfig] of Object.entries(toolsetsConfig)) {
    switch (toolsetName) {
      case "workers": {
        // Worker delegation toolset - requires allowed_workers list
        const workersConfig = toolsetConfig as { allowed_workers?: string[] } | undefined;
        const allowedWorkers = workersConfig?.allowed_workers || [];

        if (allowedWorkers.length === 0) {
          throw new Error("Workers toolset requires 'allowed_workers' list in config.");
        }

        const registry = options.registry || new WorkerRegistry();
        if (options.programRoot) {
          registry.addSearchPath(options.programRoot);
        }

        // Create factory for child workers that uses createCLIWorkerRuntime
        // This ensures child workers get their tools injected properly
        const workerRunnerFactory: WorkerRunnerFactory = {
          create(childOptions: WorkerRunnerOptions): WorkerRunner {
            // Return a lazy wrapper that calls createCLIWorkerRuntime during initialize()
            return new CLIWorkerRunner(childOptions as CLIWorkerRuntimeOptions, registry);
          },
        };

        // Use async factory to create named tools for each worker
        const workerToolset = await WorkerCallToolset.create({
          registry,
          allowedWorkers,
          sandbox,
          approvalController,
          approvalCallback: options.approvalCallback,
          approvalMode: options.approvalMode || "interactive",
          delegationContext: options.delegationContext,
          programRoot: options.programRoot,
          model: options.model,
          workerRunnerFactory,
          onEvent,
          runtimeUI,
        });
        for (const tool of workerToolset.getTools()) {
          tools[tool.name] = tool;
        }
        break;
      }

      case "custom": {
        // Custom tools from a tools.ts module
        const parseResult = CustomToolsetConfigSchema.safeParse(toolsetConfig);
        if (!parseResult.success) {
          throw new Error(
            `Invalid custom toolset config: ${parseResult.error.message}`
          );
        }

        const customConfig: CustomToolsetConfig = parseResult.data;

        // Resolve module path relative to worker file or program root
        let modulePath = customConfig.module;
        if (!path.isAbsolute(modulePath)) {
          const baseDir = options.workerFilePath
            ? path.dirname(options.workerFilePath)
            : options.programRoot;

          if (!baseDir) {
            throw new Error(
              "Custom toolset requires workerFilePath or programRoot to resolve relative module paths."
            );
          }

          modulePath = path.resolve(baseDir, modulePath);
        }

        const customToolset = await createCustomToolset({
          modulePath,
          config: customConfig,
          sandbox,
        });

        for (const tool of customToolset.getTools()) {
          tools[tool.name] = tool;
        }
        break;
      }

      default: {
        // Check registry for dynamically registered toolsets
        let factory = ToolsetRegistry.get(toolsetName);

        // If not in registry, try to dynamically import the toolset module
        if (!factory) {
          const specifier = `../tools/${toolsetName}/index.js`;
          try {
            await import(specifier);
            factory = ToolsetRegistry.get(toolsetName);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const code = err && typeof err === "object" && "code" in err
              ? String((err as { code?: unknown }).code)
              : undefined;

            // Only treat "module not found" for the toolset entrypoint as "unknown toolset".
            // If the module exists but throws (syntax/runtime), surface the real error.
            const isMissingToolsetModule =
              code === "ERR_MODULE_NOT_FOUND" &&
              (message.includes(`/tools/${toolsetName}/index.js`) ||
                message.includes(`\\tools\\${toolsetName}\\index.js`) ||
                message.includes(specifier));

            if (!isMissingToolsetModule) {
              throw new Error(
                `Failed to load toolset "${toolsetName}" for worker "${worker.name}": ${message}`,
                { cause: err as unknown }
              );
            }
          }
        }

        if (factory) {
          const registeredTools = await factory({
            sandbox,
            approvalController,
            workerFilePath: options.workerFilePath,
            programRoot: options.programRoot,
            config: (toolsetConfig as Record<string, unknown>) || {},
          });
          for (const tool of registeredTools) {
            tools[tool.name] = tool;
          }
          break;
        }

        throw new Error(
          `Unknown toolset "${toolsetName}" in worker "${worker.name}". ` +
          `Valid toolsets: filesystem, workers, custom` +
          (ToolsetRegistry.list().length > 0 ? `, ${ToolsetRegistry.list().join(', ')}` : '')
        );
      }
    }
  }

  return tools;
}

/**
 * Create and initialize a CLI worker runtime.
 * Uses Core's WorkerRuntime with CLI-specific tools injected.
 */
export async function createCLIWorkerRuntime(
  options: CLIWorkerRuntimeOptions
): Promise<CoreWorkerRuntime> {
  const worker = options.worker;

  // Create approval controller
  const approvalMode = options.approvalMode || "interactive";
  let approvalController: ApprovalController;

  if (options.sharedApprovalController) {
    approvalController = options.sharedApprovalController as ApprovalController;
  } else {
    if (approvalMode === "interactive" && !options.approvalCallback) {
      throw new Error(
        'Approval mode "interactive" requires an approvalCallback. ' +
        'Either provide a callback or explicitly set approvalMode to "approve_all".'
      );
    }
    approvalController = new ApprovalController({
      mode: approvalMode,
      approvalCallback: options.approvalCallback,
    });
  }

  // Create sandbox
  const sandbox = await createSandbox(options);

  // Create tools with sandbox and approval controller
  const tools = await createTools(
    worker,
    options,
    sandbox,
    approvalController,
    options.onEvent,
    options.runtimeUI
  );

  // Create Core's WorkerRuntime with injected tools
  const runtime = await createCoreWorkerRuntime({
    ...options,
    tools: tools as Record<string, NamedTool>,
    sandbox,
    sharedApprovalController: approvalController,
  });

  return runtime;
}

/**
 * Default factory for creating CLI worker runners.
 * Used for worker delegation.
 *
 * Uses CLIWorkerRunner to ensure child workers get their tools injected
 * properly during initialize().
 */
export const defaultCLIWorkerRunnerFactory: WorkerRunnerFactory = {
  create(options: WorkerRunnerOptions): WorkerRunner {
    // Return a lazy wrapper that calls createCLIWorkerRuntime during initialize()
    // This ensures child workers get their full toolset
    return new CLIWorkerRunner(options as CLIWorkerRuntimeOptions, new WorkerRegistry());
  },
};
