# Ink Adoption Plan

Plan for adopting [Ink](https://github.com/vadimdemedes/ink) as the terminal UI framework for golem-forge.

## Monorepo Structure

> **Updated**: The project now uses npm workspaces with three packages:

| Package | Description |
|---------|-------------|
| `@golem-forge/core` | Platform-agnostic types, sandbox errors, worker schema |
| `@golem-forge/cli` | CLI implementation (Node.js) - includes UIAdapter, CLIAdapter |
| `@golem-forge/browser` | Browser extension (React/Vite) - OPFS sandbox, React components |

## Current Implementation Status

> **Important for implementers**: This section documents what already exists. The `UIAdapter` interface is frozen during Ink integration. The `CLIAdapter` is the reference implementation but will be superseded by `InkAdapter`.

### Interfaces (Frozen for Ink Integration)

| Module | Status | Notes |
|--------|--------|-------|
| `packages/cli/src/ui/adapter.ts` | 🔒 Frozen | `UIAdapter` interface - frozen during Ink integration |
| `packages/cli/src/ui/types.ts` | 🔒 Frozen | Types used by UIAdapter |
| `packages/cli/src/tools/filesystem.ts` | ✅ Stable | `ExecutionMode`, `ManualExecutionConfig` |

### Implemented Logic (Reuse)

| Module | What It Does | Reuse In Ink? |
|--------|--------------|---------------|
| `packages/cli/src/ui/tool-info.ts` | `extractManualToolInfo()`, `getManualTools()`, `isManualTool()`, `isLLMTool()` | ✅ Yes - pure logic |
| `packages/cli/src/ui/schema-to-fields.ts` | `deriveFieldsFromSchema()` - Zod → form fields | ✅ Yes - pure logic |
| `packages/cli/src/ui/diff-renderer.ts` | `renderDiff()`, `renderDiffSummary()` - diff formatting | ⚠️ Partial - output is ANSI strings, may need Ink components |
| `packages/cli/src/ui/result-utils.ts` | `toTypedToolResult()` - converts tool results | ✅ Yes - pure logic |
| `packages/cli/src/ui/command-parser.ts` | `/command` parsing with completion | ✅ Yes - pure logic |

### CLIAdapter Methods → Ink Components

The `CLIAdapter` (`packages/cli/src/ui/cli-adapter.ts`) implements `UIAdapter` imperatively. Here's how each method should map to Ink:

| UIAdapter Method | CLIAdapter Impl | Ink Equivalent |
|------------------|-----------------|----------------|
| `displayMessage()` | `console.log` with formatting | `<Message>` component in MessagesContext |
| `getUserInput()` | `readline.question()` | `<TextInput>` + InputContext |
| `requestApproval()` | Multi-select with readline | `<ApprovalDialog>` + ApprovalContext |
| `displayManualTools()` | Table output | `<ManualToolList>` component |
| `onManualToolRequest()` | Handler registration | ManualToolContext action |
| `onInterrupt()` | `SIGINT` handler | `useKeypress('escape')` |
| `showProgress()` | Status line updates | `<Footer>` with WorkerContext |
| `updateStatus()` | Colored output | `<StatusMessage>` component |
| `displayDiff()` | `renderDiff()` output | `<DiffView>` component |
| `displayDiffSummary()` | `renderDiffSummary()` output | `<DiffSummary>` component |
| `displayToolResult()` | Type-specific rendering | `<ToolResult>` component |

### Manual Tool System (Fully Implemented)

The clearance/manual tool system is complete:

```
packages/cli/src/tools/filesystem.ts    → ExecutionMode type, ManualExecutionConfig
packages/cli/src/tools/git/tools.ts     → git_push is mode:'manual' (clearance boundary)
packages/cli/src/ui/tool-info.ts        → Extract ManualToolInfo from NamedTool
packages/cli/src/ui/schema-to-fields.ts → Derive form fields from Zod schemas
packages/cli/src/ui/types.ts            → ManualToolInfo, ManualToolField, ManualToolHandler
packages/cli/src/ui/cli-adapter.ts      → displayManualTools(), executeManualTool()
```

**For Ink**: Need `<ManualToolDialog>` component that renders fields from `ManualToolInfo.fields` and collects user input.

### Not Yet Implemented (From ui-clearance-requirements.md)

| Feature | Description | Priority |
|---------|-------------|----------|
| Clearance Dashboard | List pending clearance items (staged commits) | Phase 3 |
| Diff Viewer | Full-screen diff review with navigation | Phase 3 |
| Status Bar Notifications | Badge for pending clearance items | Phase 2 |

## Architecture Context

The project uses a monorepo structure where `@golem-forge/core` provides shared types, and each platform has its own package:

```
┌─────────────────────────────────────────────────────────────────┐
│                     @golem-forge/core                           │
│   (sandbox types, worker schema, shared errors)                 │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┴─────────────────────┐
        ▼                                           ▼
┌───────────────────────────────┐    ┌───────────────────────────────┐
│       @golem-forge/cli        │    │      @golem-forge/browser     │
│  ┌─────────────────────────┐  │    │  ┌─────────────────────────┐  │
│  │    UIAdapter Interface  │  │    │  │    React Components     │  │
│  └───────────┬─────────────┘  │    │  │    OPFS Sandbox         │  │
│              │                │    │  │    Worker Manager        │  │
│  ┌───────────┴─────────────┐  │    │  └─────────────────────────┘  │
│  │  CLIAdapter (readline)  │  │    └───────────────────────────────┘
│  │     - or -              │  │
│  │  InkAdapter (React/Ink) │  │
│  └─────────────────────────┘  │
└───────────────────────────────┘
```

The `UIAdapter` interface (`packages/cli/src/ui/adapter.ts`) provides the CLI UI contract:

**Key insight**: The `UIAdapter` interface is the contract for CLI implementations. `@golem-forge/browser` uses React components directly. Shared *logic* (not components) can be extracted to `@golem-forge/core` for reuse.

## Experiment Results

### Prototype v2 (Context-Based Architecture)

See `experiments/ink-ui-prototype/` - refactored to use context-based architecture inspired by [Gemini CLI](https://github.com/google-gemini/gemini-cli).

**What was validated:**
- Context-based state management works well with Ink
- Semantic theming (palette → tokens → components)
- Worker tree display in footer and approval dialogs
- Streaming content rendering
- All `UIAdapter` methods implementable without interface changes

**Architecture validated in prototype:**

```
ThemeProvider              # Semantic colors
└── WorkerProvider         # Worker tree state (golem-forge specific)
    └── ApprovalProvider   # Approval flow + session/always memory
        └── MessagesProvider   # Conversation + streaming
            └── UIStateProvider    # UI mode, model info
                └── App
                    ├── Header
                    ├── Composer → MainContent
                    └── Footer (worker status, model, context %)
```

**Demo:** `cd experiments/ink-ui-prototype && npm run demo:v2`

### Gemini CLI Patterns Adopted

| Pattern | Description | Adopted |
|---------|-------------|---------|
| Separated contexts | State vs actions in different contexts | ✅ |
| Semantic theming | 3-layer: palette → tokens → usage | ✅ |
| Message components | One component per message type | ✅ |
| Footer status bar | Model, context %, status indicators | ✅ |
| Hooks library | `useTerminalSize`, `useKeyCommands` | ✅ |

### golem-forge Differentiators Preserved

| Feature | Implementation |
|---------|---------------|
| Worker hierarchy | `WorkerContext` tracks tree, `useWorkerPath()` for delegation chain |
| Rich approval types | `"session"` and `"always"` with pattern matching |
| Worker path in approvals | `ApprovalDialog` shows full delegation chain |
| Worker status in footer | Shows active/total workers, current task |

## Shared Logic Layer (Proposed)

Extract platform-agnostic logic from contexts for reuse between CLI and browser. The monorepo structure enables clean separation:

```
packages/
├── core/src/                 # @golem-forge/core - Shared (no React, no Ink)
│   ├── sandbox-types.ts      # ✅ Already exists
│   ├── sandbox-errors.ts     # ✅ Already exists
│   ├── worker-schema.ts      # ✅ Already exists
│   ├── approval-state.ts     # NEW: Pattern matching, auto-approve, history
│   ├── worker-state.ts       # NEW: Tree operations, path computation
│   └── message-state.ts      # NEW: History, streaming buffer
│
├── cli/src/ui/               # @golem-forge/cli - CLI-specific
│   ├── ink/                  # Ink implementation
│   │   ├── contexts/         # React bindings for shared logic
│   │   ├── components/       # Ink components
│   │   └── InkAdapter.tsx
│   └── cli-adapter.ts        # Fallback readline implementation
│
└── browser/src/              # @golem-forge/browser - Browser-specific
    ├── components/           # React DOM components
    └── services/             # ✅ Already has WorkerManager, etc.
```

### Example: Shared Approval Logic

```typescript
// packages/core/src/approval-state.ts - Platform agnostic
export interface ApprovalState {
  sessionApprovals: ApprovalPattern[];
  alwaysApprovals: ApprovalPattern[];
  history: ApprovalHistoryEntry[];
}

export function createApprovalState(): ApprovalState;
export function isAutoApproved(state: ApprovalState, request: UIApprovalRequest): boolean;
export function addApproval(state: ApprovalState, request: UIApprovalRequest, result: UIApprovalResult): ApprovalState;
```

```typescript
// packages/cli/src/ui/ink/contexts/ApprovalContext.tsx - CLI binding
import { createApprovalState, isAutoApproved, addApproval } from "@golem-forge/core";

export function ApprovalProvider({ children }) {
  const [state, setState] = useState(createApprovalState);
  // Uses shared logic, provides React context
}
```

### What Gets Shared

| Module | @golem-forge/core (Shared) | @golem-forge/cli (Ink) | @golem-forge/browser |
|--------|---------------------------|------------------------|---------------------|
| Approval | Pattern matching, history, auto-approve rules | React Context | React hooks |
| Workers | Tree ops, path computation, status tracking | React Context | WorkerManager service |
| Messages | History management, streaming buffer | React Context | Component state |
| Themes | Token definitions, semantic mappings | Ink colors | CSS variables |

## Updated Directory Structure

```
packages/
├── core/                     # @golem-forge/core
│   └── src/
│       ├── index.ts          # Package exports
│       ├── sandbox-types.ts  # ✅ Exists
│       ├── sandbox-errors.ts # ✅ Exists
│       ├── worker-schema.ts  # ✅ Exists
│       ├── approval-state.ts # NEW: Pattern matching, auto-approve
│       ├── worker-state.ts   # NEW: Tree operations, path computation
│       └── message-state.ts  # NEW: History, streaming buffer
│
├── cli/                      # @golem-forge/cli
│   └── src/
│       ├── ui/
│       │   ├── adapter.ts        # UIAdapter interface (unchanged)
│       │   ├── types.ts          # CLI-specific UI types (unchanged)
│       │   ├── cli-adapter.ts    # Legacy CLI adapter (fallback)
│       │   ├── index.ts          # UI exports
│       │   │
│       │   └── ink/              # NEW: Ink implementation
│       │       ├── index.ts
│       │       ├── InkAdapter.tsx
│       │       ├── contexts/
│       │       │   ├── ThemeContext.tsx
│       │       │   ├── WorkerContext.tsx
│       │       │   ├── ApprovalContext.tsx
│       │       │   ├── MessagesContext.tsx
│       │       │   └── UIStateContext.tsx
│       │       ├── hooks/
│       │       │   ├── useTerminalSize.ts
│       │       │   └── useKeyHandler.ts
│       │       ├── components/
│       │       │   ├── messages/     # UserMessage, AssistantMessage, WorkerMessage
│       │       │   ├── dialogs/      # ApprovalDialog
│       │       │   ├── shared/       # DiffView, ToolResult, Progress
│       │       │   └── layout/       # Header, Footer, MainContent
│       │       └── themes/
│       │           ├── types.ts
│       │           └── default.ts
│       └── ...
│
└── browser/                  # @golem-forge/browser
    └── src/
        ├── background.ts     # Service worker entry
        ├── services/         # ✅ Exists: WorkerManager, BrowserRuntime, etc.
        ├── storage/          # ✅ Exists: ProjectManager, SettingsManager
        └── components/       # NEW: React DOM components (when UI is added)
```

## Adoption Strategy (Revised)

### Phase 1: Extract Shared Logic to @golem-forge/core
1. Add platform-agnostic state management to `packages/core/src/`:
   - `approval-state.ts` - pattern matching, auto-approve rules
   - `worker-state.ts` - tree operations, path computation
   - `message-state.ts` - history management, streaming buffer
2. Export from `packages/core/src/index.ts`
3. Unit test shared logic independently
4. No UI changes yet

### Phase 2: Integrate Ink into @golem-forge/cli
1. Add Ink dependencies to `packages/cli/package.json`
2. Copy prototype to `packages/cli/src/ui/ink/`
3. Refactor contexts to import shared logic from `@golem-forge/core`
4. Wire up `InkAdapter` to implement `UIAdapter`
5. Add feature flag for adapter selection in CLI

### Phase 3: Enhanced Features
1. Syntax highlighting in messages
2. Scrollable history
3. Command palette for manual tools
4. Split pane for worker tree

### Phase 4: Default & Cleanup
1. Make Ink the default adapter in `@golem-forge/cli`
2. Simplify `CLIAdapter` to output-only fallback
3. Update documentation

## UIAdapter Interface

**Frozen during Ink integration.** The interface defines the contract and will remain stable while we implement `InkAdapter` and `HeadlessAdapter`.

Current interface methods map cleanly to context actions:

| Interface Method | Ink Implementation |
|-----------------|-------------------|
| `displayMessage` | `messages.addMessage()` |
| `getUserInput` | `ui.requestInput()` |
| `requestApproval` | `approval.requestApproval()` |
| `showProgress` | `workers.updateFromProgress()` |
| `updateStatus` | `messages.addStatus()` |
| `displayToolResult` | `messages.addToolResult()` |

## Dependencies

Versions validated in prototype (`experiments/ink-ui-prototype/package.json`):

```json
{
  "ink": "^6.0.0",
  "@inkjs/ui": "^2.0.0",
  "react": "^19.0.0"
}
```

Dev dependencies:
```json
{
  "@types/react": "^19.0.0",
  "tsx": "^4.19.0"
}
```

## Clarifications

### Bundle Size

**What it is**: Bundle size refers to the total JavaScript code added to the CLI package when Ink is included as a dependency. Ink 6.0 + React 19 + @inkjs/ui adds approximately 500KB of minified code.

**Why it matters**: Larger bundles mean slower CLI startup time and more disk space. For a CLI tool, startup latency is noticeable to users.

**Decision**: 500KB is acceptable for a rich TUI. The tradeoff is worth it for the improved user experience. If needed later, dynamic import (`await import('ink')`) can defer loading until the UI is actually rendered.

### Ink Rendering Failures

**When Ink fails to render**:
1. **Non-TTY environment**: When stdout is not a terminal (pipes, CI logs, redirected output). Ink requires a TTY to render its React components.
2. **Terminal capability issues**: Very old terminals or minimal environments (e.g., some Docker containers) may lack required ANSI escape sequence support.
3. **Memory constraints**: Extremely limited environments might fail to load React.

**Fallback strategy**: Out of scope. A `HeadlessAdapter` for non-TTY/CI environments will be addressed in a separate plan.

## Open Questions

1. ~~**Streaming output**: How does Ink handle streaming LLM responses?~~
   **Resolved**: Use `setStreaming()` / `appendStreaming()` / `commitStreaming()` pattern in MessagesContext.

2. ~~**Bundle size**: Is ~500KB acceptable?~~
   **Resolved**: Yes, acceptable. Dynamic import available if needed.

3. **Testing**: Ink provides `render()` for testing. Need strategy for CI (likely use ink-testing-library).

## References

### Internal

- Prototype v2: `experiments/ink-ui-prototype/` (context-based)
- Gemini CLI analysis: `docs/notes/archive/gemini-cli-alignment.md` (archived)
- Clearance UI requirements: `docs/notes/archive/ui-clearance-requirements.md` (archived, key items above)

### Current Implementation

| Component | Location |
|-----------|----------|
| UIAdapter interface | `packages/cli/src/ui/adapter.ts` |
| CLIAdapter | `packages/cli/src/ui/cli-adapter.ts` |
| UI types | `packages/cli/src/ui/types.ts` |
| Core package | `packages/core/src/` |
| Browser extension | `packages/browser/src/` |

### External

- Ink docs: https://github.com/vadimdemedes/ink
- Ink UI components: https://github.com/vadimdemedes/ink-ui
