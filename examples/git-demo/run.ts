#!/usr/bin/env npx tsx
/**
 * Git Toolset Demo
 *
 * This script shows the expected demo flow.
 * For the actual working demo with mock LLM, run:
 *
 *   npx vitest run examples/git-demo/demo.test.ts
 *
 * The test uses vitest mocking to simulate LLM responses.
 */

console.log("╔════════════════════════════════════════════════════════════╗");
console.log("║              Git Toolset Demo                              ║");
console.log("╚════════════════════════════════════════════════════════════╝");
console.log("");
console.log("This demo requires vitest mocking for the LLM simulation.");
console.log("");
console.log("To run the full demo:");
console.log("");
console.log("  npx vitest run examples/git-demo/demo.test.ts");
console.log("");
console.log("The demo will:");
console.log("  1. Create /tmp/golem-git-demo with initial commit");
console.log("  2. Mock LLM writes a new section to README.md");
console.log("  3. Mock LLM stages the file (git_stage)");
console.log("  4. Manually invoke git_push");
console.log("  5. Verify commit appears in git history");
console.log("");
console.log("Expected flow with real LLM:");
console.log("─".repeat(60));
console.log("");
console.log("User: Add a new section to README.md and stage it");
console.log("");
console.log("LLM:  [calls write_file to modify README.md]");
console.log("      [calls git_stage with files and message]");
console.log("");
console.log("      ────────────────────────────────────────");
console.log("      APPROVAL REQUEST");
console.log("      ────────────────────────────────────────");
console.log("      Tool: git_stage");
console.log("");
console.log("      Files to stage:");
console.log("        /workspace/README.md");
console.log("");
console.log('      Commit message: "Add new section"');
console.log("      ────────────────────────────────────────");
console.log("      Approve? [y]es / [n]o / [r]emember: y");
console.log("");
console.log("LLM:  I've staged the changes. Use /tool git_push to push.");
console.log("");
console.log("User: /tool git_push ...");
console.log("");
console.log("      [commit pushed to repository]");
