# Ink Adoption Plan

Plan for adopting [Ink](https://github.com/vadimdemedes/ink) as the terminal UI framework for golem-forge.

## Monorepo Structure

> **Updated**: The project now uses npm workspaces with four packages:

| Package | Description |
|---------|-------------|
| `@golem-forge/core` | Platform-agnostic types, sandbox errors, worker schema, UIEventBus |
| `@golem-forge/ui-react` | Shared React state management, contexts, hooks (used by Ink and browser) |
| `@golem-forge/cli` | CLI implementation (Node.js) - includes EventCLIAdapter, HeadlessAdapter |
| `@golem-forge/browser` | Browser extension (React/Vite) - OPFS sandbox, React components |

## Current Implementation Status

> **Important for implementers**: This section documents what already exists. The event-driven UI architecture is now the standard. `EventCLIAdapter` and `HeadlessAdapter` are the current implementations; `InkAdapter` will be added.

### Core UI Infrastructure (Stable)

| Module | Status | Notes |
|--------|--------|-------|
| `packages/core/src/ui-event-bus.ts` | ✅ Stable | `UIEventBus` - type-safe pub/sub |
| `packages/core/src/runtime-ui.ts` | ✅ Stable | `RuntimeUI` - convenience wrapper |
| `packages/ui-react/src/state/` | ✅ Stable | Pure state functions |
| `packages/ui-react/src/contexts/` | ✅ Stable | React contexts with event bus integration |
| `packages/cli/src/ui/types.ts` | ✅ Stable | Types used by UI implementations |
| `packages/cli/src/tools/filesystem.ts` | ✅ Stable | `ExecutionMode`, `ManualExecutionConfig` |

### Implemented Logic (Reuse)

| Module | What It Does | Reuse In Ink? |
|--------|--------------|---------------|
| `packages/cli/src/ui/tool-info.ts` | `extractManualToolInfo()`, `getManualTools()`, `isManualTool()`, `isLLMTool()` | ✅ Yes - pure logic |
| `packages/cli/src/ui/schema-to-fields.ts` | `deriveFieldsFromSchema()` - Zod → form fields | ✅ Yes - pure logic |
| `packages/cli/src/ui/diff-renderer.ts` | `renderDiff()`, `renderDiffSummary()` - diff formatting | ⚠️ Partial - output is ANSI strings, may need Ink components |
| `packages/cli/src/ui/result-utils.ts` | `toTypedToolResult()` - converts tool results | ✅ Yes - pure logic |
| `packages/cli/src/ui/command-parser.ts` | `/command` parsing with completion | ✅ Yes - pure logic |

### Event Bus Events → Ink Components

The `InkAdapter` will subscribe to events via `UIProvider` from `@golem-forge/ui-react`. Here's how events map to components:

| Event | Hook | Ink Component |
|-------|------|---------------|
| `message` | `useMessages()` | `<Message>` component |
| `streaming` | `useStreaming()` | `<StreamingMessage>` component |
| `approvalRequired` | `usePendingApproval()` | `<ApprovalDialog>` component |
| `workerUpdate` | `useActiveWorker()` | `<Footer>` with worker status |
| `toolResult` | `useToolResults()` | `<ToolResult>` component |
| `status` | `useMessages()` | `<StatusMessage>` component |
| `manualToolsAvailable` | custom | `<ManualToolList>` component |
| `inputPrompt` | `useUIMode()` | `<TextInput>` component |

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

The project uses a monorepo structure with event-driven UI architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                     @golem-forge/core                           │
│   (sandbox types, worker schema, UIEventBus, RuntimeUI)         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   @golem-forge/ui-react                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  State Modules  │  │  React Contexts │  │   UIProvider    │  │
│  │  (pure funcs)   │  │  (event bus)    │  │   (combined)    │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┴───────────────────┐
          ▼                                       ▼
┌───────────────────────────────┐    ┌───────────────────────────────┐
│       @golem-forge/cli        │    │      @golem-forge/browser     │
│  ┌─────────────────────────┐  │    │  ┌─────────────────────────┐  │
│  │  EventCLIAdapter        │  │    │  │    React Components     │  │
│  │  HeadlessAdapter        │  │    │  │    OPFS Sandbox         │  │
│  │  InkAdapter (planned)   │  │    │  │    (uses UIProvider)    │  │
│  └─────────────────────────┘  │    │  └─────────────────────────┘  │
└───────────────────────────────┘    └───────────────────────────────┘
```

**Key insight**: The UI system is now event-driven via `UIEventBus`. Both Ink (terminal) and browser UIs can share state management from `@golem-forge/ui-react`.

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

## Shared Logic Layer (Implemented)

> **Status**: ✅ Complete. State modules and React contexts now live in `@golem-forge/ui-react`.

The shared UI state infrastructure has been extracted into `@golem-forge/ui-react`:

```
packages/
├── core/src/                 # @golem-forge/core - Events & Types
│   ├── sandbox-types.ts      # ✅ Sandbox types
│   ├── sandbox-errors.ts     # ✅ Error types
│   ├── worker-schema.ts      # ✅ Worker schema
│   ├── ui-event-bus.ts       # ✅ UIEventBus (pub/sub)
│   └── runtime-ui.ts         # ✅ RuntimeUI (convenience wrapper)
│
├── ui-react/src/             # @golem-forge/ui-react - React State Management
│   ├── state/                # Pure state functions (no React)
│   │   ├── approval-state.ts # ✅ Pattern matching, auto-approve
│   │   ├── worker-state.ts   # ✅ Tree operations, path computation
│   │   └── message-state.ts  # ✅ History, streaming buffer
│   ├── contexts/             # React contexts with event bus integration
│   │   ├── EventBusContext.tsx
│   │   ├── MessagesContext.tsx
│   │   ├── ApprovalContext.tsx
│   │   ├── WorkerContext.tsx
│   │   └── UIStateContext.tsx
│   ├── hooks/                # Convenience hooks
│   │   ├── useMessages.ts
│   │   ├── useApproval.ts
│   │   ├── useWorkers.ts
│   │   └── useUIState.ts
│   └── providers/
│       └── UIProvider.tsx    # Combined provider
│
├── cli/src/ui/               # @golem-forge/cli - CLI-specific
│   ├── event-cli-adapter.ts  # ✅ Terminal adapter (readline)
│   ├── headless-adapter.ts   # ✅ CI/automated adapter
│   └── ink/                  # Ink implementation (planned)
│       ├── InkAdapter.tsx    # Uses UIProvider from ui-react
│       └── components/       # Ink-specific components
│
└── browser/src/              # @golem-forge/browser - Browser-specific
    ├── components/           # React DOM components (uses UIProvider)
    └── services/             # ✅ WorkerManager, BrowserRuntime
```

### State Module Usage

State modules are pure functions that can be used with or without React:

```typescript
// packages/ui-react/src/state/approval-state.ts
import { createApprovalState, isAutoApproved, addApproval } from "@golem-forge/ui-react";

const state = createApprovalState();
const approved = isAutoApproved(state, request);
const newState = addApproval(state, request, result);
```

### React Context Usage

Contexts subscribe to UIEventBus and manage state automatically:

```typescript
// packages/ui-react/src/contexts/ApprovalContext.tsx
import { createApprovalState, isAutoApproved, addApproval } from "../state/approval-state.js";

export function ApprovalProvider({ children, bus }) {
  const [state, setState] = useState(createApprovalState);

  useEffect(() => {
    const unsub = bus.on('approvalRequired', (event) => {
      // Handle approval request
    });
    return unsub;
  }, [bus]);
  // ...
}
```

### What Gets Shared

| Module | @golem-forge/ui-react | @golem-forge/cli (Ink) | @golem-forge/browser |
|--------|----------------------|------------------------|---------------------|
| State | Pure functions | Via UIProvider | Via UIProvider |
| Contexts | All contexts | Imports from ui-react | Imports from ui-react |
| Hooks | All hooks | Imports from ui-react | Imports from ui-react |
| Events | Types from core | Subscribes via bus | Subscribes via bus |

## Current Directory Structure

```
packages/
├── core/                     # @golem-forge/core
│   └── src/
│       ├── index.ts          # Package exports
│       ├── sandbox-types.ts  # ✅ Sandbox types
│       ├── sandbox-errors.ts # ✅ Error types
│       ├── worker-schema.ts  # ✅ Worker schema
│       ├── ui-event-bus.ts   # ✅ UIEventBus (pub/sub)
│       └── runtime-ui.ts     # ✅ RuntimeUI wrapper
│
├── ui-react/                 # @golem-forge/ui-react (NEW)
│   └── src/
│       ├── index.ts          # Package exports
│       ├── state/            # Pure state functions
│       │   ├── approval-state.ts
│       │   ├── worker-state.ts
│       │   └── message-state.ts
│       ├── contexts/         # React contexts
│       │   ├── EventBusContext.tsx
│       │   ├── MessagesContext.tsx
│       │   ├── ApprovalContext.tsx
│       │   ├── WorkerContext.tsx
│       │   └── UIStateContext.tsx
│       ├── hooks/            # Convenience hooks
│       │   ├── useMessages.ts
│       │   ├── useApproval.ts
│       │   ├── useWorkers.ts
│       │   └── useUIState.ts
│       └── providers/
│           └── UIProvider.tsx
│
├── cli/                      # @golem-forge/cli
│   └── src/
│       ├── ui/
│       │   ├── types.ts          # CLI-specific UI types
│       │   ├── event-cli-adapter.ts  # ✅ Terminal adapter
│       │   ├── headless-adapter.ts   # ✅ CI/automated adapter
│       │   ├── index.ts          # UI exports
│       │   │
│       │   └── ink/              # Ink implementation (planned)
│       │       ├── index.ts
│       │       ├── InkAdapter.tsx    # Uses UIProvider from ui-react
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
        ├── services/         # ✅ WorkerManager, BrowserRuntime, etc.
        ├── storage/          # ✅ ProjectManager, SettingsManager
        └── components/       # React DOM components (uses UIProvider)
```

## Adoption Strategy (Revised)

### Phase 1: Extract Shared Logic to @golem-forge/ui-react ✅ COMPLETE
1. ~~Add platform-agnostic state management~~ → Created `@golem-forge/ui-react`
   - `approval-state.ts` - pattern matching, auto-approve rules ✅
   - `worker-state.ts` - tree operations, path computation ✅
   - `message-state.ts` - history management, streaming buffer ✅
2. ~~Export from package~~ → All exports in `packages/ui-react/src/index.ts` ✅
3. ~~Unit test shared logic~~ → 198 tests passing ✅
4. React contexts subscribe to UIEventBus ✅

### Phase 2: Integrate Ink into @golem-forge/cli
1. Add Ink dependencies to `packages/cli/package.json`
2. Create `packages/cli/src/ui/ink/` directory
3. Create `InkAdapter` that:
   - Wraps app in `UIProvider` from `@golem-forge/ui-react`
   - Uses contexts/hooks for all state management
   - Only needs Ink-specific components (terminal rendering)
4. Wire up `InkAdapter` to implement event-driven UI pattern
5. Add feature flag for adapter selection in CLI

### Phase 3: Enhanced Features
1. Syntax highlighting in messages
2. Scrollable history
3. Command palette for manual tools
4. Split pane for worker tree

### Phase 4: Default & Cleanup
1. Make Ink the default adapter in `@golem-forge/cli`
2. EventCLIAdapter becomes fallback for non-TTY environments
3. Update documentation

## Event-Driven UI Pattern

> **Note**: The project has moved to an event-driven UI architecture. The UIEventBus replaces direct method calls.

Runtime emits events via `UIEventBus`, UI implementations subscribe and react:

| Event | Context Handler | Hook |
|-------|-----------------|------|
| `message` | `MessagesContext` subscribes | `useMessages()` |
| `streaming` | `MessagesContext` subscribes | `useStreaming()` |
| `approvalRequired` | `ApprovalContext` subscribes | `usePendingApproval()` |
| `workerUpdate` | `WorkerContext` subscribes | `useActiveWorker()` |
| `toolResult` | `MessagesContext` subscribes | `useToolResults()` |
| `status` | `MessagesContext` subscribes | `useMessages()` |

### InkAdapter Strategy

The `InkAdapter` will:
1. Wrap the Ink app in `UIProvider` from `@golem-forge/ui-react`
2. Use hooks to access state (no custom state management needed)
3. Focus only on Ink-specific rendering components

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

**Fallback strategy**: ✅ Implemented. `HeadlessAdapter` handles non-TTY/CI environments with auto-approve and auto-manual tool options.

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
| UIEventBus | `packages/core/src/ui-event-bus.ts` |
| RuntimeUI | `packages/core/src/runtime-ui.ts` |
| State modules | `packages/ui-react/src/state/` |
| React contexts | `packages/ui-react/src/contexts/` |
| Convenience hooks | `packages/ui-react/src/hooks/` |
| UIProvider | `packages/ui-react/src/providers/UIProvider.tsx` |
| EventCLIAdapter | `packages/cli/src/ui/event-cli-adapter.ts` |
| HeadlessAdapter | `packages/cli/src/ui/headless-adapter.ts` |
| UI types | `packages/cli/src/ui/types.ts` |
| Browser extension | `packages/browser/src/` |

### External

- Ink docs: https://github.com/vadimdemedes/ink
- Ink UI components: https://github.com/vadimdemedes/ink-ui
