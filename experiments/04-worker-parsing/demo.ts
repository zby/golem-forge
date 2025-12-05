/**
 * Demo: Worker Parsing
 *
 * Demonstrates parsing .worker files with frontmatter validation.
 */

import { parseWorkerFile, formatParseError } from "./src/index.js";
import { readdir } from "fs/promises";
import { join } from "path";

async function main() {
  console.log("=== Experiment 1.4: Worker Parsing Demo ===\n");

  const workersDir = "./workers";

  // List all worker files
  const files = await readdir(workersDir);
  const workerFiles = files.filter((f) => f.endsWith(".worker"));

  console.log(`Found ${workerFiles.length} worker files:\n`);

  for (const file of workerFiles) {
    const filePath = join(workersDir, file);
    console.log(`--- ${file} ---`);

    const result = await parseWorkerFile(filePath);

    if (result.success) {
      const w = result.worker;
      console.log(`  Name: ${w.name}`);
      console.log(`  Description: ${w.description || "(none)"}`);
      console.log(`  Model: ${w.model || "(default)"}`);

      if (w.sandbox?.paths) {
        const paths = Object.keys(w.sandbox.paths);
        console.log(`  Sandbox paths: ${paths.join(", ")}`);
      }

      if (w.toolsets) {
        const toolsets = Object.keys(w.toolsets);
        console.log(`  Toolsets: ${toolsets.join(", ")}`);
      }

      if (w.compatible_models?.length) {
        console.log(`  Compatible models: ${w.compatible_models.join(", ")}`);
      }

      if (w.attachment_policy) {
        console.log(`  Max attachments: ${w.attachment_policy.max_attachments}`);
      }

      // Show first 100 chars of instructions
      const preview = w.instructions.slice(0, 100).replace(/\n/g, " ");
      console.log(`  Instructions: ${preview}${w.instructions.length > 100 ? "..." : ""}`);

      console.log("  Status: VALID");
    } else {
      console.log("  Status: INVALID");
      console.log("  Error:");
      console.log("  " + formatParseError(result).split("\n").join("\n  "));
    }

    console.log();
  }

  // Test invalid worker
  console.log("--- Testing invalid worker (in-memory) ---");
  const invalidContent = `---
description: Missing required name field
sandbox:
  paths:
    output:
      root: ./out
      mode: invalid
---
Instructions here.
`;

  const { parseWorkerString } = await import("./src/index.js");
  const invalidResult = parseWorkerString(invalidContent);

  if (!invalidResult.success) {
    console.log("  Status: INVALID (as expected)");
    console.log("  Error: " + formatParseError(invalidResult).split("\n").join("\n  "));
  }

  console.log("\n=== Demo Complete ===");
}

main().catch(console.error);
