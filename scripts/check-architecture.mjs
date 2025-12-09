#!/usr/bin/env node
/**
 * Architecture Boundary Checker
 *
 * Enforces the "core = logic, packages = adapters" rule by scanning
 * platform packages for forbidden patterns.
 *
 * See docs/notes/core-vs-platform.md for the architectural rationale.
 *
 * Usage: node scripts/check-architecture.mjs
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Platform packages that should not contain runtime logic
const PLATFORM_PACKAGES = ['packages/cli/src', 'packages/chrome/src'];

// Files to exclude from checking
const EXCLUDED_PATTERNS = [
  /\.test\.ts$/,
  /\.spec\.ts$/,
  /testing\//,
  /__tests__\//,
];

// Patterns that indicate architectural violations
const FORBIDDEN_PATTERNS = [
  // Direct AI SDK imports
  {
    regex: /from\s+["']ai["']/,
    message: 'Direct AI SDK import. Import from @golem-forge/core instead.',
  },
  {
    regex: /from\s+["']@ai-sdk\//,
    message:
      'Direct AI SDK provider import. Provider factories belong in @golem-forge/core.',
  },
  // Runtime function calls (these should only be in core)
  {
    regex: /\bstreamText\s*\(/,
    message: 'streamText should only be called from @golem-forge/core runtime.',
  },
  {
    regex: /\bgenerateText\s*\(/,
    message:
      'generateText should only be called from @golem-forge/core runtime.',
  },
  // Defining core abstractions (should not be redefined in platform packages)
  {
    regex: /class\s+\w*Runtime\s+/,
    message:
      'Runtime classes should be defined in @golem-forge/core, not platform packages.',
    warnOnly: true, // Warn for now since BrowserWorkerRuntime exists
  },
  {
    regex: /export\s+function\s+matchModelPattern/,
    message:
      'matchModelPattern is defined in @golem-forge/core. Import it instead of redefining.',
  },
];

/**
 * Check if a file should be excluded from checking.
 */
function isExcluded(filePath) {
  return EXCLUDED_PATTERNS.some((pattern) => pattern.test(filePath));
}

/**
 * Recursively get all TypeScript files in a directory.
 */
function getTypeScriptFiles(dir) {
  const files = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== 'dist') {
        files.push(...getTypeScriptFiles(fullPath));
      }
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Check a file for forbidden patterns.
 */
function checkFile(filePath) {
  const violations = [];

  if (isExcluded(filePath)) {
    return violations;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNumber = i + 1;

    for (const pattern of FORBIDDEN_PATTERNS) {
      const match = line.match(pattern.regex);
      if (match) {
        violations.push({
          file: filePath,
          line: lineNumber,
          pattern: pattern.regex.source,
          match: match[0],
          message: pattern.message + (pattern.warnOnly ? ' (warning)' : ''),
          warnOnly: pattern.warnOnly || false,
        });
      }
    }
  }

  return violations;
}

/**
 * Main function.
 */
function main() {
  const rootDir = path.resolve(__dirname, '..');
  const violations = [];
  const warnings = [];

  console.log('🔍 Checking architecture boundaries...\n');

  for (const packagePath of PLATFORM_PACKAGES) {
    const fullPath = path.join(rootDir, packagePath);
    console.log(`  Scanning ${packagePath}...`);

    const files = getTypeScriptFiles(fullPath);
    for (const file of files) {
      const fileViolations = checkFile(file);
      for (const v of fileViolations) {
        if (v.warnOnly) {
          warnings.push(v);
        } else {
          violations.push(v);
        }
      }
    }
  }

  console.log('');

  // Print warnings
  if (warnings.length > 0) {
    console.log(`⚠️  Found ${warnings.length} warning(s):\n`);
    for (const v of warnings) {
      const relativePath = path.relative(rootDir, v.file);
      console.log(`  ${relativePath}:${v.line}`);
      console.log(`    Match: ${v.match}`);
      console.log(`    ${v.message}\n`);
    }
  }

  // Print errors
  if (violations.length > 0) {
    console.log(`❌ Found ${violations.length} architecture violation(s):\n`);
    for (const v of violations) {
      const relativePath = path.relative(rootDir, v.file);
      console.log(`  ${relativePath}:${v.line}`);
      console.log(`    Match: ${v.match}`);
      console.log(`    ${v.message}\n`);
    }

    console.log('See docs/notes/core-vs-platform.md for guidelines.\n');
    process.exit(1);
  }

  if (warnings.length === 0) {
    console.log('✅ No architecture violations found.\n');
  } else {
    console.log('✅ No blocking violations. Review warnings above.\n');
  }
}

main();
