/**
 * CLI Entry Point
 *
 * Main CLI application for running workers.
 */

import { Command } from "commander";
import * as fs from "fs/promises";
import { createWorkerRuntime, type WorkerRuntimeOptions } from "../runtime/index.js";
import { WorkerRegistry } from "../worker/index.js";
import { createCLIApprovalCallback } from "./approval.js";
import { findProjectRoot, getEffectiveConfig, resolveWorkerPaths } from "./project.js";
import type { ApprovalMode } from "../approval/index.js";
import type { TrustLevel } from "../sandbox/index.js";

/**
 * CLI options from command line.
 */
interface CLIOptions {
  model?: string;
  trust?: TrustLevel;
  approval?: ApprovalMode;
  input?: string;
  file?: string;
  project?: string;
  verbose?: boolean;
}

/**
 * Read input from various sources.
 */
async function readInput(options: CLIOptions, args: string[]): Promise<string> {
  // Input from --input flag
  if (options.input) {
    return options.input;
  }

  // Input from --file flag
  if (options.file) {
    return fs.readFile(options.file, "utf-8");
  }

  // Input from positional arguments (after worker name)
  if (args.length > 1) {
    return args.slice(1).join(" ");
  }

  // Read from stdin if available
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf-8").trim();
  }

  throw new Error("No input provided. Use --input, --file, positional args, or pipe to stdin.");
}

/**
 * Main CLI execution.
 */
export async function runCLI(argv: string[] = process.argv): Promise<void> {
  const program = new Command();

  program
    .name("golem-forge")
    .description("Run LLM workers with tool support and approval")
    .version("0.1.0")
    .argument("<worker>", "Worker name or path to .worker file")
    .argument("[input...]", "Input text for the worker")
    .option("-m, --model <model>", "Model to use (e.g., anthropic:claude-haiku-4-5)")
    .option("-t, --trust <level>", "Trust level: untrusted, session, workspace, full", "session")
    .option("-a, --approval <mode>", "Approval mode: interactive, approve_all, strict", "interactive")
    .option("-i, --input <text>", "Input text (alternative to positional args)")
    .option("-f, --file <path>", "Read input from file")
    .option("-p, --project <path>", "Project root directory")
    .option("-v, --verbose", "Verbose output")
    .action(async (workerArg: string, inputArgs: string[], options: CLIOptions) => {
      try {
        await executeWorker(workerArg, inputArgs, options);
      } catch (err) {
        console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }
    });

  await program.parseAsync(argv);
}

/**
 * Execute a worker with the given options.
 */
async function executeWorker(
  workerArg: string,
  inputArgs: string[],
  options: CLIOptions
): Promise<void> {
  // Find project root
  const projectInfo = await findProjectRoot(options.project);
  const projectRoot = projectInfo?.root || process.cwd();
  const effectiveConfig = getEffectiveConfig(projectInfo?.config, {
    model: options.model,
    trustLevel: options.trust as TrustLevel,
    approvalMode: options.approval as ApprovalMode,
  });

  if (options.verbose) {
    console.log(`Project root: ${projectRoot}`);
    if (projectInfo) {
      console.log(`Detected by: ${projectInfo.detectedBy}`);
    }
  }

  // Create worker registry
  const registry = new WorkerRegistry();

  // Add project worker paths
  const workerPaths = resolveWorkerPaths(projectRoot, effectiveConfig.workerPaths || []);
  for (const workerPath of workerPaths) {
    registry.addSearchPath(workerPath);
  }

  // Also add current directory
  registry.addSearchPath(process.cwd());

  // Look up worker
  const lookupResult = await registry.get(workerArg);
  if (!lookupResult.found) {
    throw new Error(lookupResult.error);
  }

  const worker = lookupResult.worker;

  if (options.verbose) {
    console.log(`Worker: ${worker.definition.name}`);
    console.log(`File: ${worker.filePath}`);
  }

  // Read input
  const input = await readInput(options, [workerArg, ...inputArgs]);

  if (options.verbose) {
    console.log(`Input: ${input.slice(0, 100)}${input.length > 100 ? "..." : ""}`);
    console.log("");
  }

  // Create approval callback
  const approvalCallback = effectiveConfig.approvalMode === "interactive"
    ? createCLIApprovalCallback()
    : undefined;

  // Create runtime options
  const runtimeOptions: WorkerRuntimeOptions = {
    worker: worker.definition,
    model: effectiveConfig.model,
    approvalMode: effectiveConfig.approvalMode as ApprovalMode,
    approvalCallback,
    trustLevel: effectiveConfig.trustLevel as TrustLevel,
    projectRoot,
  };

  // Create and initialize runtime
  const runtime = await createWorkerRuntime(runtimeOptions);

  // Run worker
  if (options.verbose) {
    console.log("Running worker...\n");
  }

  const result = await runtime.run(input);

  // Output result
  if (result.success) {
    console.log(result.response);

    if (options.verbose) {
      console.log("\n─".repeat(30));
      console.log(`Tool calls: ${result.toolCallCount}`);
      if (result.tokens) {
        console.log(`Tokens: ${result.tokens.input} in / ${result.tokens.output} out`);
      }
      if (result.cost) {
        console.log(`Cost: $${result.cost.toFixed(6)}`);
      }
    }
  } else {
    console.error(`Worker failed: ${result.error}`);
    process.exit(1);
  }
}

// Run CLI if this is the main module
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  runCLI().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
