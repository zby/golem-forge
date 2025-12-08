# Ink Adoption Plan

Plan for adopting [Ink](https://github.com/vadimdemedes/ink) as the terminal UI framework for golem-forge.

## Current Implementation Status

> **Important for implementers**: This section documents what already exists. The `UIAdapter` interface and types are stable. The `CLIAdapter` is the reference implementation but will be superseded by `InkAdapter`.

### Stable Interfaces (Preserve)

| Module | Status | Notes |
|--------|--------|-------|
| `src/ui/adapter.ts` | ✅ Stable | `UIAdapter` interface - the contract |
| `src/ui/types.ts` | ✅ Stable | All types used by UIAdapter |
| `src/tools/filesystem.ts` | ✅ Stable | `ExecutionMode`, `ManualExecutionConfig` |

### Implemented Logic (Reuse)

| Module | What It Does | Reuse In Ink? |
|--------|--------------|---------------|
| `src/ui/tool-info.ts` | `extractManualToolInfo()`, `getManualTools()`, `isManualTool()`, `isLLMTool()` | ✅ Yes - pure logic |
| `src/ui/schema-to-fields.ts` | `deriveFieldsFromSchema()` - Zod → form fields | ✅ Yes - pure logic |
| `src/ui/diff-renderer.ts` | `renderDiff()`, `renderDiffSummary()` - diff formatting | ⚠️ Partial - output is ANSI strings, may need Ink components |
| `src/ui/result-utils.ts` | `toTypedToolResult()` - converts tool results | ✅ Yes - pure logic |
| `src/ui/command-parser.ts` | `/command` parsing with completion | ✅ Yes - pure logic |

### CLIAdapter Methods → Ink Components

The `CLIAdapter` (`src/ui/cli-adapter.ts`) implements `UIAdapter` imperatively. Here's how each method should map to Ink:

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
src/tools/filesystem.ts    → ExecutionMode type, ManualExecutionConfig
src/tools/git/tools.ts     → git_push is mode:'manual' (clearance boundary)
src/ui/tool-info.ts        → Extract ManualToolInfo from NamedTool
src/ui/schema-to-fields.ts → Derive form fields from Zod schemas
src/ui/types.ts            → ManualToolInfo, ManualToolField, ManualToolHandler
src/ui/cli-adapter.ts      → displayManualTools(), executeManualTool()
```

**For Ink**: Need `<ManualToolDialog>` component that renders fields from `ManualToolInfo.fields` and collects user input.

### Not Yet Implemented (From ui-clearance-requirements.md)

| Feature | Description | Priority |
|---------|-------------|----------|
| Clearance Dashboard | List pending clearance items (staged commits) | Phase 3 |
| Diff Viewer | Full-screen diff review with navigation | Phase 3 |
| Status Bar Notifications | Badge for pending clearance items | Phase 2 |

## Architecture Context

The `UIAdapter` interface (`src/ui/adapter.ts`) provides platform-independent UI abstraction:

```
┌─────────────────────────────────────────────────────────────────┐
│                      UIAdapter Interface                        │
│    (displayMessage, requestApproval, showProgress...)           │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  Shared Logic │    │  Shared Logic │    │  Shared Logic │
│  (approval,   │    │  (approval,   │    │  (approval,   │
│   workers)    │    │   workers)    │    │   workers)    │
└───────┬───────┘    └───────┬───────┘    └───────┬───────┘
        ▼                    ▼                    ▼
┌───────────────┐    ┌───────────────┐    ┌───────────────┐
│  InkAdapter   │    │ BrowserAdapter│    │  CLIAdapter   │
│  (React/Ink)  │    │ (React DOM)   │    │  (readline)   │
└───────────────┘    └───────────────┘    └───────────────┘
```

**Key insight**: The `UIAdapter` interface is the contract. Internal architecture (contexts, state management) is implementation-specific. Shared *logic* (not components) can be extracted for reuse.

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

Extract platform-agnostic logic from contexts for reuse between CLI and browser:

```
src/ui/
├── logic/                    # Shared (no React, no Ink)
│   ├── approval-state.ts     # Pattern matching, auto-approve, history
│   ├── worker-state.ts       # Tree operations, path computation
│   ├── message-state.ts      # History, streaming buffer
│   └── theme-tokens.ts       # Semantic token definitions
│
├── ink/                      # CLI-specific
│   ├── contexts/             # React bindings for shared logic
│   ├── components/           # Ink components
│   └── InkAdapter.tsx
│
└── browser/                  # Browser-specific (future)
    ├── hooks/                # React hooks for shared logic
    └── components/           # React DOM components
```

### Example: Shared Approval Logic

```typescript
// src/ui/logic/approval-state.ts - Platform agnostic
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
// src/ui/ink/contexts/ApprovalContext.tsx - CLI binding
import { createApprovalState, isAutoApproved, addApproval } from "../../logic/approval-state.js";

export function ApprovalProvider({ children }) {
  const [state, setState] = useState(createApprovalState);
  // Uses shared logic, provides React context
}
```

### What Gets Shared

| Module | Shared Logic | Platform Binding |
|--------|-------------|------------------|
| Approval | Pattern matching, history, auto-approve rules | React Context (Ink) / Hook (Browser) |
| Workers | Tree ops, path computation, status tracking | React Context (Ink) / Redux (Browser) |
| Messages | History management, streaming buffer | React Context (Ink) / State (Browser) |
| Themes | Token definitions, semantic mappings | Ink colors / CSS variables |

## Updated Directory Structure

```
src/ui/
├── adapter.ts              # UIAdapter interface (unchanged)
├── types.ts                # Shared types (unchanged)
│
├── logic/                  # NEW: Platform-agnostic logic
│   ├── approval-state.ts
│   ├── worker-state.ts
│   ├── message-state.ts
│   └── theme-tokens.ts
│
├── ink/                    # Ink implementation
│   ├── index.ts
│   ├── InkAdapter.tsx
│   ├── contexts/
│   │   ├── ThemeContext.tsx
│   │   ├── WorkerContext.tsx
│   │   ├── ApprovalContext.tsx
│   │   ├── MessagesContext.tsx
│   │   └── UIStateContext.tsx
│   ├── hooks/
│   │   ├── useTerminalSize.ts
│   │   └── useKeyHandler.ts
│   ├── components/
│   │   ├── messages/       # UserMessage, AssistantMessage, WorkerMessage
│   │   ├── dialogs/        # ApprovalDialog
│   │   ├── shared/         # DiffView, ToolResult, Progress
│   │   └── layout/         # Header, Footer, MainContent
│   └── themes/
│       ├── types.ts
│       └── default.ts
│
├── cli-adapter.ts          # Legacy CLI adapter (fallback)
└── index.ts                # Exports
```

## Adoption Strategy (Revised)

### Phase 1: Extract Shared Logic
1. Create `src/ui/logic/` with platform-agnostic state management
2. Unit test shared logic independently
3. No UI changes yet

### Phase 2: Integrate Ink
1. Copy prototype to `src/ui/ink/`
2. Refactor contexts to use shared logic
3. Wire up `InkAdapter` to implement `UIAdapter`
4. Add feature flag for adapter selection

### Phase 3: Enhanced Features
1. Syntax highlighting in messages
2. Scrollable history
3. Command palette for manual tools
4. Split pane for worker tree

### Phase 4: Default & Cleanup
1. Make Ink the default adapter
2. Simplify `CLIAdapter` to output-only fallback
3. Update documentation

## UIAdapter Interface

**No changes needed.** The interface defines the contract; internal architecture is implementation-specific.

Current interface methods map cleanly to context actions:

| Interface Method | Ink Implementation |
|-----------------|-------------------|
| `displayMessage` | `messages.addMessage()` |
| `getUserInput` | `ui.requestInput()` |
| `requestApproval` | `approval.requestApproval()` |
| `showProgress` | `workers.updateFromProgress()` |
| `updateStatus` | `messages.addStatus()` |
| `displayToolResult` | `messages.addToolResult()` |

## Open Questions (Updated)

1. ~~**Streaming output**: How does Ink handle streaming LLM responses?~~
   **Resolved**: Use `setStreaming()` / `appendStreaming()` / `commitStreaming()` pattern in MessagesContext.

2. **Bundle size**: Is ~500KB acceptable? Consider dynamic import.

3. **Testing**: Ink provides `render()` for testing. Need strategy for CI.

4. **Shared logic granularity**: How much logic to extract vs keep platform-specific?

## References

- Prototype v2: `experiments/ink-ui-prototype/` (context-based)
- Gemini CLI analysis: `docs/notes/archive/gemini-cli-alignment.md` (archived)
- Clearance UI requirements: `docs/notes/archive/ui-clearance-requirements.md` (archived, key items above)
- Ink docs: https://github.com/vadimdemedes/ink
- Ink UI components: https://github.com/vadimdemedes/ink-ui
- Current CLIAdapter: `src/ui/cli-adapter.ts`
- UIAdapter interface: `src/ui/adapter.ts`
