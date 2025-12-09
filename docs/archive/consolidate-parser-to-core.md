# Plan: Consolidate Worker Parser into Core Package

## Goal

Move the worker file parser from `@golem-forge/cli` to `@golem-forge/core` to:
1. Eliminate test duplication between CLI and core
2. Make the parser available to the browser extension
3. Remove the `gray-matter` dependency (which has multiple sub-dependencies)
4. Use the zero-dependency `yaml` package instead

## Current State

- **CLI** (`packages/cli/src/worker/parser.ts`): Uses `gray-matter` for frontmatter extraction + Zod schemas from core
- **Core** (`packages/core/src/worker-schema.ts`): Has Zod schemas but no parsing
- **Tests**: Both packages test schema validation (duplication)

## Changes

### 1. Add `yaml` package to core

```bash
cd packages/core && npm install yaml
```

### 2. Create frontmatter parser in core

Create `packages/core/src/frontmatter.ts`:

```typescript
import { parse as parseYaml } from 'yaml';

const FRONTMATTER_REGEX = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?([\s\S]*)$/;

export interface FrontmatterResult {
  data: Record<string, unknown>;
  content: string;
}

export function parseFrontmatter(content: string): FrontmatterResult {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) {
    return { data: {}, content: content.trim() };
  }
  const [, yamlContent, body] = match;
  const data = (parseYaml(yamlContent) as Record<string, unknown>) ?? {};
  return { data, content: body.trim() };
}
```

### 3. Create worker parser in core

Create `packages/core/src/worker-parser.ts`:

```typescript
import { parseFrontmatter } from './frontmatter.js';
import { WorkerDefinitionSchema, type ParseWorkerResult } from './worker-schema.js';

export function parseWorkerString(content: string, filePath?: string): ParseWorkerResult {
  const fileContext = filePath ? ` in ${filePath}` : "";

  try {
    const { data, content: body } = parseFrontmatter(content);

    const result = WorkerDefinitionSchema.safeParse({
      ...data,
      instructions: body,
    });

    if (!result.success) {
      return {
        success: false,
        error: `Invalid worker definition${fileContext}`,
        details: result.error,
      };
    }

    return {
      success: true,
      worker: result.data,
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse worker file${fileContext}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
```

### 4. Export from core index

Update `packages/core/src/index.ts` to export:
- `parseFrontmatter` and `FrontmatterResult` from frontmatter.ts
- `parseWorkerString` from worker-parser.ts

### 5. Move tests to core

Move/consolidate tests from `packages/cli/src/worker/parser.test.ts` into:
- `packages/core/src/frontmatter.test.ts` - Test frontmatter extraction edge cases
- `packages/core/src/worker-parser.test.ts` - Test full worker parsing (YAML + schema)

Delete redundant tests from `packages/core/src/worker-schema.test.ts` that are now covered by worker-parser tests.

### 6. Update CLI to re-export from core

Update `packages/cli/src/worker/parser.ts`:

```typescript
// Re-export from core for backwards compatibility
export { parseWorkerString } from '@golem-forge/core';
export { formatParseError } from './schema.js';
```

### 7. Remove gray-matter from CLI

```bash
cd packages/cli && npm uninstall gray-matter
```

### 8. Delete redundant CLI tests

Remove or significantly reduce `packages/cli/src/worker/parser.test.ts` since tests now live in core.

## File Changes Summary

| Action | File |
|--------|------|
| Create | `packages/core/src/frontmatter.ts` |
| Create | `packages/core/src/frontmatter.test.ts` |
| Create | `packages/core/src/worker-parser.ts` |
| Create | `packages/core/src/worker-parser.test.ts` |
| Modify | `packages/core/src/index.ts` (add exports) |
| Modify | `packages/core/package.json` (add yaml dep) |
| Modify | `packages/cli/src/worker/parser.ts` (re-export only) |
| Modify | `packages/cli/package.json` (remove gray-matter) |
| Delete | Most of `packages/cli/src/worker/parser.test.ts` |
| Simplify | `packages/core/src/worker-schema.test.ts` (remove duplication) |

## Testing

1. Run core tests: `npm run test -w @golem-forge/core`
2. Run CLI tests: `npm run test -w @golem-forge/cli`
3. Run full build: `npm run build`
4. Manual test: Parse a .worker file

## Rollback

If issues arise, revert and keep gray-matter in CLI.
