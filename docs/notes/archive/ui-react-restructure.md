# UI-React Package Restructure Plan

## Goal

Create a shared `@golem-forge/ui-react` package containing React contexts, hooks, and state management that both Ink (terminal) and Browser UIs can use.

## Current Structure

```
packages/
├── core/src/
│   ├── ui-events.ts          # Event types
│   ├── ui-event-bus.ts       # Event bus
│   ├── runtime-ui.ts         # Runtime wrapper
│   ├── ui-implementation.ts  # Base interface
│   ├── message-state.ts      # → move to ui-react
│   ├── approval-state.ts     # → move to ui-react
│   └── worker-state.ts       # → move to ui-react
│
├── cli/src/ui/
│   ├── event-cli-adapter.ts  # Terminal adapter
│   ├── headless-adapter.ts   # CI adapter
│   └── ink/                  # → will use ui-react
│
└── browser/src/              # → will use ui-react
```

## Target Structure

```
packages/
├── core/src/                    # Minimal, no React, no Node
│   ├── ui-events.ts             # Event types + result types
│   ├── ui-event-bus.ts          # Event bus implementation
│   ├── runtime-ui.ts            # RuntimeUI wrapper
│   ├── ui-implementation.ts     # BaseUIImplementation
│   └── index.ts
│
├── ui-react/src/                # NEW: Shared React layer
│   ├── state/                   # Pure state functions (moved from core)
│   │   ├── message-state.ts
│   │   ├── approval-state.ts
│   │   ├── worker-state.ts
│   │   └── index.ts
│   ├── contexts/                # React contexts
│   │   ├── EventBusContext.tsx
│   │   ├── MessagesContext.tsx
│   │   ├── ApprovalContext.tsx
│   │   ├── WorkerContext.tsx
│   │   ├── UIStateContext.tsx
│   │   └── index.ts
│   ├── hooks/                   # Convenience hooks
│   │   ├── useEventBus.ts
│   │   ├── useMessages.ts
│   │   ├── useApproval.ts
│   │   ├── useWorkers.ts
│   │   ├── useUIState.ts
│   │   └── index.ts
│   ├── providers/               # Combined provider
│   │   └── UIProvider.tsx
│   └── index.ts
│
├── cli/src/ui/
│   ├── headless-adapter.ts      # Keep: CI/automated mode
│   ├── event-cli-adapter.ts     # DEPRECATED: Remove once Ink is ready
│   ├── ink/                     # PRIMARY CLI UI (Ink/React)
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   ├── messages/
│   │   │   └── dialogs/
│   │   ├── theme.ts
│   │   ├── InkApp.tsx
│   │   └── InkAdapter.ts
│   ├── shared/                  # Shared between Ink and legacy terminal
│   │   ├── diff-renderer.ts
│   │   ├── command-parser.ts
│   │   └── index.ts
│   └── index.ts
│
└── browser/src/ui/              # Browser-specific rendering
    ├── components/
    ├── theme.ts
    └── BrowserApp.tsx
```

## CLI UI Roadmap

| Adapter | Status | Purpose |
|---------|--------|---------|
| **HeadlessAdapter** | Keep | CI/automated pipelines, no TTY |
| **EventCLIAdapter** | Deprecated → Remove | Legacy terminal UI |
| **InkAdapter** | New → Primary | Interactive terminal UI with React |

The EventCLIAdapter will be removed once InkAdapter reaches feature parity:
- [ ] Message display with streaming
- [ ] Approval dialogs
- [ ] Tool result rendering (diff, file content, etc.)
- [ ] Manual tool invocation
- [ ] Keyboard shortcuts (Ctrl+C interrupt)
- [ ] Status/progress display

## Implementation Steps

### Phase 1: Create ui-react package

1. **Create package structure**
   ```bash
   mkdir -p packages/ui-react/src/{state,contexts,hooks,providers}
   ```

2. **Initialize package.json**
   ```json
   {
     "name": "@golem-forge/ui-react",
     "version": "0.1.0",
     "type": "module",
     "main": "dist/index.js",
     "types": "dist/index.d.ts",
     "dependencies": {
       "@golem-forge/core": "workspace:*",
       "react": "^18.0.0"
     },
     "peerDependencies": {
       "react": "^18.0.0"
     }
   }
   ```

3. **Move state files from core**
   - `core/src/message-state.ts` → `ui-react/src/state/message-state.ts`
   - `core/src/approval-state.ts` → `ui-react/src/state/approval-state.ts`
   - `core/src/worker-state.ts` → `ui-react/src/state/worker-state.ts`
   - Update imports (they import types from `@golem-forge/core`)

4. **Update core exports**
   - Remove state exports from `core/src/index.ts`
   - Keep only: events, bus, runtime-ui, implementation

### Phase 2: Implement contexts

Each context follows the same pattern:

```typescript
// contexts/MessagesContext.tsx
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import type { UIEventBus } from '@golem-forge/core';
import {
  MessageState,
  createMessageState,
  addMessage,
  setStreaming,
  appendStreaming,
  commitStreaming
} from '../state/message-state';

interface MessagesContextValue {
  state: MessageState;
  actions: {
    clear: () => void;
  };
}

const MessagesContext = createContext<MessagesContextValue | null>(null);

interface MessagesProviderProps {
  children: ReactNode;
  bus: UIEventBus;
}

export function MessagesProvider({ children, bus }: MessagesProviderProps) {
  const [state, setState] = useState(createMessageState);

  // Subscribe to events
  useEffect(() => {
    const unsubs = [
      bus.on('message', (event) => {
        setState(s => addMessage(s, event.message));
      }),
      bus.on('streaming', (event) => {
        setState(s => {
          if (event.done) return commitStreaming(s);
          if (s.isStreaming) return appendStreaming(s, event.delta);
          return setStreaming(s, event.delta);
        });
      }),
      bus.on('toolResult', (event) => {
        setState(s => addToolResult(s, event));
      }),
      bus.on('status', (event) => {
        setState(s => addStatus(s, event));
      }),
    ];
    return () => unsubs.forEach(fn => fn());
  }, [bus]);

  const clear = useCallback(() => setState(createMessageState), []);

  return (
    <MessagesContext.Provider value={{ state, actions: { clear } }}>
      {children}
    </MessagesContext.Provider>
  );
}

export function useMessagesState() {
  const ctx = useContext(MessagesContext);
  if (!ctx) throw new Error('useMessagesState must be used within MessagesProvider');
  return ctx.state;
}

export function useMessagesActions() {
  const ctx = useContext(MessagesContext);
  if (!ctx) throw new Error('useMessagesActions must be used within MessagesProvider');
  return ctx.actions;
}
```

**Contexts to implement:**
- `EventBusContext` - Provides bus to tree
- `MessagesContext` - Conversation history + streaming
- `ApprovalContext` - Pending approval, auto-approve patterns
- `WorkerContext` - Worker tree state
- `UIStateContext` - UI mode (idle, input, approval), focus, errors

### Phase 3: Implement hooks

Simple re-exports + convenience combinations:

```typescript
// hooks/useMessages.ts
export { useMessagesState, useMessagesActions } from '../contexts/MessagesContext';

export function useMessages() {
  return useMessagesState().messages;
}

export function useStreaming() {
  const state = useMessagesState();
  return { content: state.streamingContent, isStreaming: state.isStreaming };
}
```

### Phase 4: Combined provider

```typescript
// providers/UIProvider.tsx
import { ReactNode } from 'react';
import type { UIEventBus } from '@golem-forge/core';
import { EventBusProvider } from '../contexts/EventBusContext';
import { MessagesProvider } from '../contexts/MessagesContext';
import { ApprovalProvider } from '../contexts/ApprovalContext';
import { WorkerProvider } from '../contexts/WorkerContext';
import { UIStateProvider } from '../contexts/UIStateContext';

interface UIProviderProps {
  children: ReactNode;
  bus: UIEventBus;
}

export function UIProvider({ children, bus }: UIProviderProps) {
  return (
    <EventBusProvider bus={bus}>
      <UIStateProvider>
        <WorkerProvider bus={bus}>
          <ApprovalProvider bus={bus}>
            <MessagesProvider bus={bus}>
              {children}
            </MessagesProvider>
          </ApprovalProvider>
        </WorkerProvider>
      </UIStateProvider>
    </EventBusProvider>
  );
}
```

### Phase 5: Update CLI package

1. **Update dependencies**
   ```json
   {
     "dependencies": {
       "@golem-forge/core": "workspace:*",
       "@golem-forge/ui-react": "workspace:*"
     }
   }
   ```

2. **Reorganize ui/ directory**
   - Keep `event-cli-adapter.ts` and `headless-adapter.ts` (they don't use React)
   - Create `ink/` subdirectory for Ink components

3. **Update imports** in any files that imported state from core

### Phase 6: Update browser package

Same pattern as CLI - add dependency, use UIProvider + contexts.

## File Changes Summary

### Files to create
- `packages/ui-react/package.json`
- `packages/ui-react/tsconfig.json`
- `packages/ui-react/src/index.ts`
- `packages/ui-react/src/state/index.ts`
- `packages/ui-react/src/state/message-state.ts` (moved)
- `packages/ui-react/src/state/approval-state.ts` (moved)
- `packages/ui-react/src/state/worker-state.ts` (moved)
- `packages/ui-react/src/contexts/EventBusContext.tsx`
- `packages/ui-react/src/contexts/MessagesContext.tsx`
- `packages/ui-react/src/contexts/ApprovalContext.tsx`
- `packages/ui-react/src/contexts/WorkerContext.tsx`
- `packages/ui-react/src/contexts/UIStateContext.tsx`
- `packages/ui-react/src/contexts/index.ts`
- `packages/ui-react/src/hooks/*.ts`
- `packages/ui-react/src/providers/UIProvider.tsx`

### Files to modify
- `packages/core/src/index.ts` - Remove state exports
- `packages/cli/package.json` - Add ui-react dependency
- `packages/browser/package.json` - Add ui-react dependency
- Any files importing state from core

### Files to delete
- `packages/core/src/message-state.ts`
- `packages/core/src/approval-state.ts`
- `packages/core/src/worker-state.ts`

## Testing Strategy

1. **State functions** - Keep existing tests, move to ui-react package
2. **Contexts** - Unit test with React Testing Library
3. **Integration** - Test UIProvider with mock event bus
4. **E2E** - Existing CLI tests should still pass

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing imports | Search all files for state imports before removing |
| React version conflicts | Use peerDependencies for React |
| Build order issues | Ensure ui-react builds after core, before cli/browser |
| Test coverage gap | Move tests along with code |

## Questions to Resolve

1. **Should state tests move with state files?** Yes, keeps tests co-located.

2. **What React version?** React 18+ for concurrent features (optional but nice).

3. **Should contexts be generic?** No, keep them specific to our events. Simpler.

4. **TypeScript project references?** Yes, for faster incremental builds.

## Recommendation

**Implement this restructure before Ink**, because:
- Ink components will import from `@golem-forge/ui-react`
- Clean foundation prevents duplicate code
- State tests validate the move worked
- ~1-2 hours of work, saves refactoring later
