#!/usr/bin/env node
/**
 * CLI Entry Point
 *
 * Main CLI application for running workers.
 */

import { Command } from "commander";
import * as fs from "fs/promises";
import * as path from "path";
import { createWorkerRuntime, type WorkerRuntimeOptions } from "../runtime/index.js";
import { parseWorkerString } from "../worker/index.js";
import { createCLIApprovalCallback } from "./approval.js";
import { getEffectiveConfig } from "./project.js";
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
async function readInput(options: CLIOptions, inputArgs: string[]): Promise<string> {
  // Input from --input flag
  if (options.input) {
    return options.input;
  }

  // Input from --file flag
  if (options.file) {
    return fs.readFile(options.file, "utf-8");
  }

  // Input from positional arguments
  if (inputArgs.length > 0) {
    return inputArgs.join(" ");
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
 * Find index.worker file in directory.
 */
async function findIndexWorker(workerDir: string): Promise<string> {
  const indexWorkerPath = path.join(workerDir, "index.worker");

  try {
    await fs.access(indexWorkerPath);
    return indexWorkerPath;
  } catch {
    throw new Error(`No index.worker file found in ${workerDir}`);
  }
}

/**
 * Valid trust levels.
 */
const VALID_TRUST_LEVELS = ["untrusted", "session", "workspace", "full"] as const;

/**
 * Valid approval modes.
 */
const VALID_APPROVAL_MODES = ["interactive", "approve_all", "strict"] as const;

/**
 * Parse and validate trust level option.
 */
function parseTrustLevel(value: string): TrustLevel {
  if (!VALID_TRUST_LEVELS.includes(value as TrustLevel)) {
    throw new Error(`Invalid trust level: ${value}. Must be one of: ${VALID_TRUST_LEVELS.join(", ")}`);
  }
  return value as TrustLevel;
}

/**
 * Parse and validate approval mode option.
 */
function parseApprovalMode(value: string): ApprovalMode {
  if (!VALID_APPROVAL_MODES.includes(value as ApprovalMode)) {
    throw new Error(`Invalid approval mode: ${value}. Must be one of: ${VALID_APPROVAL_MODES.join(", ")}`);
  }
  return value as ApprovalMode;
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
    .argument("[dir]", "Worker directory containing index.worker", ".")
    .argument("[input...]", "Input text for the worker")
    .option("-m, --model <model>", "Model to use (e.g., anthropic:claude-haiku-4-5)")
    .option("-t, --trust <level>", "Trust level: untrusted, session, workspace, full", parseTrustLevel, "session")
    .option("-a, --approval <mode>", "Approval mode: interactive, approve_all, strict", parseApprovalMode, "interactive")
    .option("-i, --input <text>", "Input text (alternative to positional args)")
    .option("-f, --file <path>", "Read input from file")
    .option("-v, --verbose", "Verbose output")
    .action(async (dirArg: string, inputArgs: string[], options: CLIOptions) => {
      try {
        await executeWorker(dirArg, inputArgs, options);
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
  dirArg: string,
  inputArgs: string[],
  options: CLIOptions
): Promise<void> {
  // Resolve worker directory to absolute path
  const workerDir = path.resolve(dirArg);

  // Find index.worker in directory
  const workerFilePath = await findIndexWorker(workerDir);

  // Read and parse worker file
  const workerContent = await fs.readFile(workerFilePath, "utf-8");
  const parseResult = parseWorkerString(workerContent);
  if (!parseResult.success) {
    throw new Error(`Failed to parse ${workerFilePath}: ${parseResult.error}`);
  }

  const workerDefinition = parseResult.worker;

  // Get effective config (CLI options override worker defaults)
  const effectiveConfig = getEffectiveConfig(undefined, {
    model: options.model,
    trustLevel: options.trust,
    approvalMode: options.approval,
  });

  if (options.verbose) {
    console.log(`Worker directory: ${workerDir}`);
    console.log(`Worker file: ${workerFilePath}`);
    console.log(`Worker: ${workerDefinition.name}`);
  }

  // Read input
  const input = await readInput(options, inputArgs);

  if (options.verbose) {
    console.log(`Input: ${input.slice(0, 100)}${input.length > 100 ? "..." : ""}`);
    console.log("");
  }

  // Create approval callback
  const approvalCallback = effectiveConfig.approvalMode === "interactive"
    ? createCLIApprovalCallback()
    : undefined;

  // Create runtime options - use worker directory as project root
  const runtimeOptions: WorkerRuntimeOptions = {
    worker: workerDefinition,
    model: options.model || workerDefinition.model || effectiveConfig.model,
    approvalMode: effectiveConfig.approvalMode as ApprovalMode,
    approvalCallback,
    trustLevel: effectiveConfig.trustLevel as TrustLevel,
    projectRoot: workerDir,
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
      console.log("\n" + "─".repeat(30));
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
// Handle symlinks by resolving the real path
import { realpathSync } from "fs";
import { fileURLToPath } from "url";

function isMainModule(): boolean {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const entryFile = realpathSync(process.argv[1]);
    return currentFile === entryFile;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  runCLI().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
