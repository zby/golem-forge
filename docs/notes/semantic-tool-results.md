# Semantic Types for Tool Results

> **Status**: Implemented in Phase 1 and Phase 2. See implementation details below.

## Problem Statement

The current tool result system has 5 hardcoded types (`text`, `diff`, `file_content`, `file_list`, `json`). This creates friction for tool plugins:

1. **Adding new result types** requires changes across multiple packages (core types, CLI renderer, browser renderer)
2. **Platform-specific tools** (CLI-only or browser-only) can't express rich results without core changes
3. **The `json` fallback** provides no semantic information - UIs can only dump raw JSON

## Design Goals

1. **Backward compatible** - existing tools continue to work
2. **Extensible** - new result types without core changes
3. **Graceful degradation** - UIs render unknown types reasonably
4. **No code injection** - tools provide data and hints, not rendering code
5. **Platform agnostic** - same result works on CLI and browser (with different fidelity)

## Proposed Design

### Core Principle

Tools return **semantic data** with **type information** and **display hints**. UIs interpret what they can and fall back gracefully for unknown types.

### Type Structure

```typescript
/**
 * Base interface for all tool results.
 * Tools can use well-known types or define custom ones.
 */
interface ToolResultValue {
  /**
   * Result type identifier.
   * Well-known types: 'text', 'diff', 'file_content', 'file_list', 'table', 'image', etc.
   * Custom types: 'git_status', 'test_results', 'my_plugin.custom_type', etc.
   */
  kind: string;

  /**
   * The actual result data. Structure depends on `kind`.
   */
  data: unknown;

  /**
   * Human-readable summary for compact display.
   * UIs should always be able to show at least this.
   */
  summary?: string;

  /**
   * MIME type hint for data interpretation.
   * Examples: 'text/plain', 'text/markdown', 'image/png', 'application/json'
   */
  mimeType?: string;

  /**
   * Display hints for UI rendering.
   */
  display?: DisplayHints;
}

interface DisplayHints {
  /**
   * Suggested view mode for the data.
   */
  preferredView?:
    | 'text'       // Plain text, preserve whitespace
    | 'markdown'   // Render as markdown
    | 'code'       // Syntax-highlighted code block
    | 'diff'       // Side-by-side or unified diff view
    | 'table'      // Tabular data
    | 'tree'       // Hierarchical/nested structure
    | 'image'      // Image display
    | 'raw'        // Raw JSON/data dump
    | 'hidden';    // Don't display (internal result)

  /**
   * Language hint for code highlighting.
   */
  language?: string;

  /**
   * Whether the result should be collapsed by default.
   */
  collapsed?: boolean;

  /**
   * Maximum height before scrolling (in lines or pixels depending on UI).
   */
  maxHeight?: number;

  /**
   * Priority for display ordering (higher = more prominent).
   */
  priority?: number;
}
```

### Well-Known Types

These types have standardized `data` structures that UIs can optimize for:

```typescript
// Text content
interface TextResult {
  kind: 'text';
  data: { content: string };
  mimeType?: 'text/plain' | 'text/markdown';
  display?: { preferredView?: 'text' | 'markdown' | 'code'; language?: string };
}

// File diff
interface DiffResult {
  kind: 'diff';
  data: {
    path: string;
    original?: string;
    modified: string;
    isNew: boolean;
    hunks?: DiffHunk[];  // Optional structured diff
  };
  summary?: string;  // e.g., "+15 -3 lines"
}

// File content
interface FileContentResult {
  kind: 'file_content';
  data: {
    path: string;
    content: string;
    size: number;
    encoding?: string;
  };
  mimeType?: string;  // Detected from file extension
  display?: { language?: string };
}

// Directory listing
interface FileListResult {
  kind: 'file_list';
  data: {
    path: string;
    entries: FileEntry[];
    truncated?: boolean;
  };
  summary?: string;  // e.g., "42 files"
}

interface FileEntry {
  name: string;
  type: 'file' | 'directory' | 'symlink';
  size?: number;
  modified?: string;
}

// Tabular data
interface TableResult {
  kind: 'table';
  data: {
    columns: ColumnDef[];
    rows: Record<string, unknown>[];
  };
  summary?: string;
  display?: { maxHeight?: number };
}

interface ColumnDef {
  key: string;
  label?: string;
  type?: 'string' | 'number' | 'boolean' | 'date';
  align?: 'left' | 'center' | 'right';
}

// Image (for browser UI primarily)
interface ImageResult {
  kind: 'image';
  data: {
    url?: string;       // URL or data URL
    base64?: string;    // Base64 encoded image data
    alt?: string;
  };
  mimeType: 'image/png' | 'image/jpeg' | 'image/svg+xml' | 'image/gif';
  summary?: string;
}

// Structured/JSON data (catch-all)
interface StructuredResult {
  kind: 'structured';
  data: unknown;
  summary?: string;
  display?: { preferredView?: 'tree' | 'raw' };
}
```

### UI Rendering Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    UI Receives ToolResultValue              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Is kind known?  │
                    └─────────────────┘
                      │           │
                     Yes          No
                      │           │
                      ▼           ▼
            ┌─────────────┐  ┌─────────────────────┐
            │ Use custom  │  │ Check display.      │
            │ renderer    │  │ preferredView       │
            └─────────────┘  └─────────────────────┘
                                      │
                              ┌───────┴───────┐
                              ▼               ▼
                    ┌─────────────┐   ┌─────────────┐
                    │ Has hint?   │   │ No hint     │
                    │ Use generic │   │ Check       │
                    │ view mode   │   │ mimeType    │
                    └─────────────┘   └─────────────┘
                                              │
                                      ┌───────┴───────┐
                                      ▼               ▼
                            ┌─────────────┐   ┌─────────────┐
                            │ Has mime?   │   │ No mime     │
                            │ Render by   │   │ Fall back   │
                            │ mime type   │   │ to JSON     │
                            └─────────────┘   └─────────────┘
```

### CLI Rendering Examples

```typescript
function renderToolResult(result: ToolResultValue): void {
  // Try well-known type first
  switch (result.kind) {
    case 'diff':
      return renderDiff(result.data);
    case 'file_content':
      return renderFileContent(result.data, result.display);
    case 'file_list':
      return renderFileList(result.data);
    case 'table':
      return renderTable(result.data);
    case 'text':
      return renderText(result.data, result.display);
  }

  // Unknown type - use hints
  const view = result.display?.preferredView ?? inferView(result);

  switch (view) {
    case 'text':
    case 'markdown':
      return renderAsText(result.data, result.display);
    case 'code':
      return renderAsCode(result.data, result.display?.language);
    case 'table':
      return renderAsTable(result.data);
    case 'tree':
      return renderAsTree(result.data);
    case 'image':
      // CLI can't render images - show summary or URL
      return renderImageFallback(result);
    case 'hidden':
      return; // Don't render
    default:
      return renderAsJson(result.data, result.summary);
  }
}

function inferView(result: ToolResultValue): string {
  // Infer from mimeType
  if (result.mimeType?.startsWith('text/')) return 'text';
  if (result.mimeType?.startsWith('image/')) return 'image';
  if (result.mimeType === 'application/json') return 'tree';

  // Infer from data structure
  if (Array.isArray(result.data) && isTabular(result.data)) return 'table';
  if (typeof result.data === 'string') return 'text';

  return 'raw';
}
```

### Migration Path

#### Phase 1: Add semantic fields to existing types

Current types gain optional `display` hints without breaking changes:

```typescript
// Before
interface DiffResultValue {
  kind: 'diff';
  path: string;
  original?: string;
  modified: string;
  isNew: boolean;
  bytesWritten: number;
}

// After (backward compatible)
interface DiffResultValue {
  kind: 'diff';
  path: string;
  original?: string;
  modified: string;
  isNew: boolean;
  bytesWritten: number;
  // New optional fields
  summary?: string;
  display?: DisplayHints;
}
```

#### Phase 2: Normalize data structure

Move type-specific fields into `data` object for consistency:

```typescript
// Normalized structure
interface DiffResultValue {
  kind: 'diff';
  data: {
    path: string;
    original?: string;
    modified: string;
    isNew: boolean;
    bytesWritten: number;
  };
  summary?: string;
  display?: DisplayHints;
}
```

Provide compatibility shim:
```typescript
function normalizeResult(result: ToolResultValue): NormalizedResult {
  // Handle legacy flat structure
  if (result.kind === 'diff' && 'path' in result) {
    return {
      kind: 'diff',
      data: { path: result.path, ... },
      summary: result.summary,
    };
  }
  return result;
}
```

#### Phase 3: Open up `kind` to arbitrary strings

Change validation from whitelist to pattern:

```typescript
// Before
const VALID_KINDS = ['text', 'diff', 'file_content', 'file_list', 'json'];

// After
function isValidKind(kind: string): boolean {
  // Allow any string matching pattern: lowercase, underscores, dots for namespacing
  return /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/.test(kind);
}
```

### Tool Plugin Example

A git tool returning structured status:

```typescript
const gitStatusTool = {
  name: 'git_status',
  execute: async () => {
    const status = await git.status();

    return {
      kind: 'git.status',  // Namespaced custom type
      data: {
        branch: status.current,
        ahead: status.ahead,
        behind: status.behind,
        staged: status.staged,
        modified: status.modified,
        untracked: status.not_added,
      },
      summary: `${status.staged.length} staged, ${status.modified.length} modified`,
      display: {
        preferredView: 'tree',
        collapsed: status.isClean,
      },
    };
  },
};
```

CLI renders as tree structure. Browser could render as a custom Git status component if it recognizes `git.status`, otherwise falls back to tree view.

### Browser-Specific Considerations

The browser UI can:

1. **Register custom renderers** for known types:
   ```typescript
   ResultRenderers.register('git.status', GitStatusComponent);
   ResultRenderers.register('image', ImageComponent);
   ```

2. **Handle rich content** that CLI cannot:
   - Images (render inline)
   - Interactive tables (sorting, filtering)
   - Collapsible trees
   - Syntax highlighting with themes

3. **Degrade gracefully** for unknown types:
   - Use `preferredView` hint
   - Fall back to JSON tree viewer

### Design Decisions

1. **Namespacing convention** - Dots for namespaces, underscores within names:
   - `git.status` - git toolset, status result
   - `git.diff` - git toolset, diff result
   - `mycompany.report` - custom namespace
   - `file_content` - core types stay un-namespaced for brevity

2. **Schema validation** - Skip for v1. UIs render what they can without validation. May add `fieldTypes` hint later for formatting (dates, URLs, paths):
   ```typescript
   display?: {
     fieldTypes?: Record<string, 'string' | 'number' | 'boolean' | 'date' | 'url' | 'path'>;
   }
   ```

3. **Streaming results** - Keep streaming text-only. Structured results arrive complete as `ToolResultValue`. Most structured results are small; streaming is mainly valuable for LLM text output.

4. **Result composition** - Single result only. Tools return one coherent result. Multiple pieces go in `data` structure, UI renders as tree/nested view. `summary` provides "at a glance" view. Can add array support later if needed (backward compatible).

5. **Internationalization** - Plain strings only for `summary`. No i18n system yet. Tools can localize on their end if needed. Can add `summaryKey` later if i18n becomes a priority.

## Files Affected

### Phase 1: Add Hints & Enable Unknown Kinds

| File | Changes |
|------|---------|
| `packages/core/src/ui-events.ts` | Add `summary?`, `mimeType?`, `display?` to result types; add `DisplayHints` interface |
| `packages/cli/src/ui/result-utils.ts` | Change `VALID_KINDS` whitelist to pattern validation; update `isToolResultValue()` |
| `packages/cli/src/ui/result-utils.test.ts` | Add tests for unknown kinds, new hints |
| `packages/cli/src/tools/filesystem.ts` | Add `summary` field to read/write/list results |
| `packages/core/src/message-state.ts` | Use `value.summary` when available instead of generating |
| `packages/core/src/message-state.test.ts` | Add tests for summary hint usage |

### Phase 2: Use Hints in Rendering

| File | Changes |
|------|---------|
| `packages/cli/src/ui/event-cli-adapter.ts` | Add default case for unknown kinds; use `display.preferredView` for rendering; add generic renderers (tree, table, code) |
| `packages/cli/src/ui/event-cli-adapter.test.ts` | Add tests for unknown kind rendering, hint usage |
| `packages/cli/src/runtime/tool-executor.ts` | May need hint-aware wrapping for unknown kinds |
| `packages/core/src/runtime-ui.ts` | Type signature auto-updates (passive) |

### Phase 3: Normalize Data Structure (future)

| File | Changes |
|------|---------|
| `packages/core/src/ui-events.ts` | Move type-specific fields into `data` object |
| `packages/cli/src/ui/result-utils.ts` | Add compatibility shim for legacy format |
| All result creators | Update to use normalized structure |

### Passive Updates (no code changes needed)

| File | Reason |
|------|--------|
| `packages/core/src/index.ts` | Exports updated types automatically |
| `packages/cli/src/ui/types.ts` | Re-exports from core |
| `packages/cli/src/ui/index.ts` | Re-exports from types |
| `packages/cli/src/index.ts` | Re-exports from ui |

### Out of Scope

| File | Notes |
|------|-------|
| `packages/browser/src/**` | Not currently using ToolResultValue; will need rendering when browser UI is built |

## Implementation Checklist

### Phase 1 ✅ Complete
- [x] Add `DisplayHints` interface to `core/src/ui-events.ts`
- [x] Add `summary?`, `mimeType?`, `display?` to existing result types
- [x] Change `VALID_KINDS` whitelist to pattern validation in `result-utils.ts`
- [x] Add `summary` field to filesystem tool results
- [x] Update `message-state.ts` to use `value.summary` when available
- [x] Add tests for unknown kinds and new hints

### Phase 2 ✅ Complete
- [x] Add default case in `event-cli-adapter.ts` for unknown kinds
- [x] Implement generic renderers (tree, table, code) based on `preferredView`
- [x] Use `mimeType` hint for content type detection
- [x] Add tests for hint-based rendering

### Phase 3 (future)
- [ ] Normalize data into `data` field for all result types
- [ ] Add compatibility shim for legacy flat structure
- [ ] Document well-known types and conventions
- [ ] Update tool authoring guide with examples

## References

- Type definitions: [`packages/core/src/ui-events.ts`](../../packages/core/src/ui-events.ts)
- Validation: [`packages/cli/src/ui/result-utils.ts`](../../packages/cli/src/ui/result-utils.ts)
- CLI rendering: [`packages/cli/src/ui/event-cli-adapter.ts`](../../packages/cli/src/ui/event-cli-adapter.ts)
- Result creation: [`packages/cli/src/tools/filesystem.ts`](../../packages/cli/src/tools/filesystem.ts)
- State management: [`packages/core/src/message-state.ts`](../../packages/core/src/message-state.ts)
