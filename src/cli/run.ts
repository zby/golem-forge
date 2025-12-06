#!/usr/bin/env node
/**
 * CLI Entry Point
 *
 * Main CLI application for running workers.
 */

import { Command } from "commander";
import * as fs from "fs/promises";
import * as path from "path";
import { createWorkerRuntime, type WorkerRuntimeOptions, type Attachment, type RunInput } from "../runtime/index.js";
import { parseWorkerString, type WorkerDefinition } from "../worker/index.js";
import { createCLIApprovalCallback } from "./approval.js";
import { getEffectiveConfig, findProjectRoot, resolveSandboxConfig } from "./project.js";
import type { ApprovalMode } from "../approval/index.js";
import type { SandboxConfig } from "../sandbox/index.js";

/**
 * CLI options from command line.
 */
interface CLIOptions {
  model?: string;
  approval?: ApprovalMode;
  input?: string;
  file?: string;
  project?: string;
  verbose?: boolean;
  attach?: string[];
}

/**
 * Read input from various sources.
 * Returns undefined if no text input is provided (e.g., only file attachments).
 */
async function readInput(options: CLIOptions, textArgs: string[]): Promise<string | undefined> {
  // Input from --input flag
  if (options.input) {
    return options.input;
  }

  // Input from --file flag
  if (options.file) {
    return fs.readFile(options.file, "utf-8");
  }

  // Input from positional arguments (after file detection)
  if (textArgs.length > 0) {
    return textArgs.join(" ");
  }

  // Read from stdin if available
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    const stdinContent = Buffer.concat(chunks).toString("utf-8").trim();
    if (stdinContent) {
      return stdinContent;
    }
  }

  // No text input - this is OK if there are file attachments
  return undefined;
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
 * Basic MIME type mapping.
 * Used for hinting the downstream provider but does not restrict attachments.
 */
const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".json": "application/json",
};

/**
 * Extensions that are auto-detected as attachments when passed as positional args.
 * These are file types that LLMs can process as attachments.
 *
 * Common support (Anthropic, OpenAI): jpeg, png, gif, webp, pdf
 * Extended support (Azure OpenAI): bmp, tiff, heif
 *
 * @see https://platform.claude.com/docs/en/build-with-claude/vision
 * @see https://platform.openai.com/docs/guides/vision
 */
const AUTO_ATTACH_EXTENSIONS = new Set([
  // Common image formats (all major providers)
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  // Documents
  ".pdf",
  // Extended image formats (Azure OpenAI, some providers)
  ".bmp",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
]);

/** Maximum attachment file size (20 MB) */
const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;

/**
 * Check if an argument looks like an auto-attachable file.
 */
function isAutoAttachExtension(arg: string): boolean {
  const ext = path.extname(arg).toLowerCase();
  return AUTO_ATTACH_EXTENSIONS.has(ext);
}

/**
 * Check if a path exists as a file.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

/**
 * Separate positional args into files (attachments) and text input.
 * Files with auto-attach extensions that exist on disk become attachments.
 * Everything else is treated as text input.
 */
async function separateFilesAndText(
  inputArgs: string[],
  workerDir: string
): Promise<{ files: string[]; textArgs: string[] }> {
  const files: string[] = [];
  const textArgs: string[] = [];

  for (const arg of inputArgs) {
    if (isAutoAttachExtension(arg)) {
      // Check if file exists (try workerDir first, then cwd)
      const candidates = path.isAbsolute(arg)
        ? [arg]
        : [path.resolve(workerDir, arg), path.resolve(arg)];

      let found = false;
      for (const candidate of candidates) {
        if (await fileExists(candidate)) {
          files.push(arg);
          found = true;
          break;
        }
      }

      if (!found) {
        // File with attachment extension but doesn't exist - treat as text
        // (will likely error, but let the user see it)
        textArgs.push(arg);
      }
    } else {
      textArgs.push(arg);
    }
  }

  return { files, textArgs };
}

/**
 * Load attachments from file paths.
 * Relative paths are resolved against the worker directory first, then the current working directory.
 */
async function loadAttachments(filePaths: string[], workerDir: string): Promise<Attachment[]> {
  const attachments: Attachment[] = [];

  for (const filePath of filePaths) {
    const candidates = path.isAbsolute(filePath)
      ? [filePath]
      : [path.resolve(workerDir, filePath), path.resolve(filePath)];

    let data: Buffer | undefined;
    let resolvedName: string | undefined;
    let lastError: unknown;

    for (const candidate of [...new Set(candidates)]) {
      try {
        // Check file size before reading to avoid loading huge files into memory
        const stat = await fs.stat(candidate);
        if (stat.size > MAX_ATTACHMENT_SIZE) {
          throw new Error(
            `File too large: ${stat.size} bytes (max ${MAX_ATTACHMENT_SIZE / 1024 / 1024} MB)`
          );
        }
        data = await fs.readFile(candidate);
        resolvedName = path.basename(candidate);
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!data) {
      const errorMessage = lastError instanceof Error ? lastError.message : "Unknown error";
      throw new Error(`Failed to read attachment ${filePath}: ${errorMessage}`);
    }

    const ext = path.extname(resolvedName || filePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || "application/octet-stream";

    attachments.push({
      data,
      mimeType,
      name: resolvedName,
    });
  }

  return attachments;
}

/**
 * Validate attachments against the worker's attachment policy.
 */
function enforceAttachmentPolicy(attachments: Attachment[], worker: WorkerDefinition): void {
  if (!worker.attachment_policy || attachments.length === 0) {
    return;
  }

  const policy = worker.attachment_policy;
  const totalBytes = attachments.reduce((sum, attachment) => {
    if (typeof attachment.data === "string") {
      return sum + Buffer.byteLength(attachment.data);
    }
    return sum + attachment.data.length;
  }, 0);

  if (attachments.length > policy.max_attachments) {
    throw new Error(
      `Attachment policy violation: up to ${policy.max_attachments} attachment(s) allowed but ${attachments.length} provided.`
    );
  }

  if (totalBytes > policy.max_total_bytes) {
    throw new Error(
      `Attachment policy violation: total size ${totalBytes} bytes exceeds limit of ${policy.max_total_bytes} bytes.`
    );
  }

  const allowed = policy.allowed_suffixes.map((s) => s.toLowerCase());
  const denied = policy.denied_suffixes.map((s) => s.toLowerCase());

  for (const attachment of attachments) {
    const name = attachment.name || "attachment";
    const ext = path.extname(name).toLowerCase();

    if (allowed.length > 0 && (ext === "" || !allowed.includes(ext))) {
      throw new Error(
        `Attachment policy violation: ${name} (${ext || "no extension"}) not in allowed list: ${allowed.join(", ")}`
      );
    }

    if (denied.length > 0 && ext && denied.includes(ext)) {
      throw new Error(`Attachment policy violation: ${name} extension ${ext} is denied.`);
    }
  }
}

/**
 * Collect multiple --attach options into an array.
 */
function collectAttachments(value: string, previous: string[]): string[] {
  return previous.concat([value]);
}

/**
 * Valid approval modes.
 */
const VALID_APPROVAL_MODES = ["interactive", "approve_all", "auto_deny"] as const;

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
    .argument("[input...]", "Input text or files (images/PDFs auto-detected as attachments)")
    .option("-m, --model <model>", "Model to use (e.g., anthropic:claude-haiku-4-5)")
    .option("-a, --approval <mode>", "Approval mode: interactive, approve_all, auto_deny", parseApprovalMode, "interactive")
    .option("-i, --input <text>", "Input text (alternative to positional args)")
    .option("-f, --file <path>", "Read input from file")
    .option("-A, --attach <file>", "Attach file explicitly (can be used multiple times)", collectAttachments, [])
    .option("-p, --project <path>", "Project root directory (auto-detected if not specified)")
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

  // Detect project root (from CLI option, or auto-detect from worker directory)
  const projectStartDir = options.project ? path.resolve(options.project) : workerDir;
  const projectInfo = await findProjectRoot(projectStartDir);
  const projectRoot = projectInfo?.root || workerDir;

  // Get effective config (CLI options override project config, which overrides defaults)
  const effectiveConfig = getEffectiveConfig(projectInfo?.config, {
    model: options.model,
    approvalMode: options.approval,
  });

  if (options.verbose && projectInfo) {
    console.log(`Project root: ${projectInfo.root} (detected by ${projectInfo.detectedBy})`);
  }

  if (options.verbose) {
    console.log(`Worker directory: ${workerDir}`);
    console.log(`Worker file: ${workerFilePath}`);
    console.log(`Worker: ${workerDefinition.name}`);
  }

  // Separate positional args into auto-detected files and text
  const { files: autoDetectedFiles, textArgs } = await separateFilesAndText(inputArgs, workerDir);

  // Combine auto-detected files with explicit --attach files
  const allAttachmentPaths = [...(options.attach || []), ...autoDetectedFiles];

  // Load attachments if any
  const attachments = allAttachmentPaths.length > 0
    ? await loadAttachments(allAttachmentPaths, workerDir)
    : undefined;

  if (attachments) {
    enforceAttachmentPolicy(attachments, workerDefinition);
  }

  // Read text input
  const textInput = await readInput(options, textArgs);

  // Check if this is a sandbox-only worker (has sandbox zones declared)
  // Support both the worker schema format (zones array) and project config format (zones object)
  const hasSandboxZones = (workerDefinition.sandbox?.zones && workerDefinition.sandbox.zones.length > 0)
    || (effectiveConfig.sandbox?.zones && Object.keys(effectiveConfig.sandbox.zones).length > 0);

  // Require either text input, attachments, or sandbox zones
  // Sandbox-only workers can run without explicit input since they operate on sandbox contents
  if (!textInput && !attachments?.length && !hasSandboxZones) {
    throw new Error("No input provided. Use text arguments, --input, --file, file attachments, pipe to stdin, or define sandbox zones.");
  }

  if (options.verbose) {
    if (textInput) {
      console.log(`Input: ${textInput.slice(0, 100)}${textInput.length > 100 ? "..." : ""}`);
    }
    if (attachments && attachments.length > 0) {
      console.log(`Attachments: ${attachments.map(a => a.name).join(", ")}`);
    }
    if (hasSandboxZones && !textInput && !attachments?.length) {
      console.log("Sandbox-only mode: worker will operate on sandbox contents");
    }
    console.log("");
  }

  // Create approval callback
  const approvalCallback = effectiveConfig.approvalMode === "interactive"
    ? createCLIApprovalCallback()
    : undefined;

  // Build sandbox configuration from project config
  let sandboxConfig: SandboxConfig | undefined;
  if (effectiveConfig.sandbox) {
    // Resolve sandbox config to absolute paths
    const resolved = resolveSandboxConfig(projectRoot, effectiveConfig.sandbox);

    // Build zones record for SandboxConfig
    const zones: Record<string, { path: string; mode: 'ro' | 'rw' }> = {};
    for (const [name, zone] of resolved.zones) {
      zones[name] = {
        path: zone.absolutePath,
        mode: zone.mode,
      };
    }

    sandboxConfig = {
      mode: resolved.mode,
      root: resolved.root,
      zones,
    };

    if (options.verbose) {
      console.log(`Sandbox root: ${resolved.root}`);
      console.log(`Sandbox zones: ${Array.from(resolved.zones.keys()).join(', ')}`);
    }
  }

  // Create runtime options - use detected project root
  // Model is already resolved: CLI --model > env var > project config
  const runtimeOptions: WorkerRuntimeOptions = {
    worker: workerDefinition,
    model: options.model || effectiveConfig.model,
    approvalMode: effectiveConfig.approvalMode as ApprovalMode,
    approvalCallback,
    projectRoot,
    sandboxConfig,
  };

  // Create and initialize runtime
  const runtime = await createWorkerRuntime(runtimeOptions);

  // Prepare run input
  // When no text input is provided, use context-appropriate default prompt
  let effectiveTextInput = textInput;
  if (!effectiveTextInput) {
    if (attachments && attachments.length > 0) {
      effectiveTextInput = "Please process the attached file(s).";
    } else if (hasSandboxZones) {
      effectiveTextInput = "Please proceed with your task using the sandbox contents.";
    }
  }
  const runInput: RunInput = attachments
    ? { content: effectiveTextInput ?? "", attachments }
    : effectiveTextInput ?? "";

  // Run worker
  if (options.verbose) {
    console.log("Running worker...\n");
  }

  const result = await runtime.run(runInput);

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

const isTestEnvironment = typeof process !== "undefined" && !!process.env.VITEST;

if (!isTestEnvironment && isMainModule()) {
  runCLI().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
