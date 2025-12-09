# Chrome Extension Architecture Update Plan

**Status:** Completed
**Date:** 2025-12-09

## Naming Convention

> **"Browser" vs "Chrome" naming:**
>
> - **"Browser"** = Generic browser APIs (OPFS, Web APIs) that could work in any browser
>   - `browser-runtime.ts`, `BrowserWorkerRuntime`, `createBrowserRuntime()`
>   - These use standard Web APIs and could be shared with a future Firefox extension
>
> - **"Chrome"** = Chrome-specific extension code (manifest v3, chrome.* APIs)
>   - `@golem-forge/chrome` package, `ChromeAdapter`, `ChromeUIStateContext`
>   - Uses Chrome extension APIs that differ between browsers
>
> If we later create `@golem-forge/firefox`, it could reuse `browser-runtime.ts`
> but would need its own `FirefoxAdapter` for Firefox-specific extension APIs.

## Overview

Update the `@golem-forge/chrome` package to use the event-driven architecture established in the CLI's InkAdapter. This aligns the Chrome extension with `@golem-forge/ui-react` contexts and the `UIEventBus` pattern from `@golem-forge/core`.

## Current State

The Chrome extension uses **traditional React component-based architecture**:

| Aspect | Current | Target |
|--------|---------|--------|
| State Management | React useState in components | UIProvider from ui-react |
| Event Communication | Direct callbacks, Promise resolvers | UIEventBus pub/sub |
| Approval Flow | Promise-based with local resolver | Event-based (approvalRequired → approvalResponse) |
| Messages | Local component state array | MessagesContext from ui-react |
| Streaming | Callback-based (onStream) | Event-based (streaming event) |

### What Works Well (Keep Unchanged)

These services are well-designed and don't need changes:

- `services/worker-manager.ts` - Worker discovery & loading
- `services/ai-service.ts` - LLM provider management (Anthropic, OpenAI, Google, OpenRouter)
- `services/opfs-sandbox.ts` - OPFS file isolation
- `services/browser-runtime.ts` - Core worker execution (wrap, don't replace)
- `storage/settings-manager.ts` - Settings persistence
- `storage/program-manager.ts` - Program CRUD
- `background.ts` - Extension lifecycle
- `popup.tsx` - Quick menu (minimal changes)

### What Needs Updating

1. **sidepanel.tsx** - Main UI, needs event bus integration
2. **Approval flow** - Convert from Promise-based to event-based
3. **Message handling** - Use MessagesContext instead of local state
4. **Streaming** - Emit events instead of callbacks

## Architecture

### Target Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     @golem-forge/core                        │
│   UIEventBus (pub/sub), RuntimeUI (convenience wrapper)      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   @golem-forge/ui-react                      │
│   MessagesContext, ApprovalContext, WorkerContext, UIState   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    @golem-forge/chrome                       │
│                                                              │
│  ┌────────────────┐  ┌─────────────────┐  ┌──────────────┐  │
│  │ ChromeAdapter  │  │   UIProvider    │  │  Components  │  │
│  │ (event bridge) │  │ (from ui-react) │  │  (React UI)  │  │
│  └────────────────┘  └─────────────────┘  └──────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              Existing Services (unchanged)              │  │
│  │  BrowserRuntime | WorkerManager | AIService | OPFS     │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Component Tree

```
<EventBusProvider bus={eventBus}>
  <UIProvider bus={eventBus}>
    <ChromeUIStateProvider>   {/* Chrome-specific: selected program, settings */}
      <SidepanelApp>
        <Header />
        <TabContainer>
          <ChatTab />         {/* Uses useMessages, useApproval, etc. */}
          <SettingsTab />
        </TabContainer>
      </SidepanelApp>
    </ChromeUIStateProvider>
  </UIProvider>
</EventBusProvider>
```

## Implementation Plan

### Phase 1: Update BrowserWorkerRuntime to Support RuntimeUI

The current `browser-runtime.ts` uses callbacks (`onStream`, `onToolCall`, `approvalCallback`). We need to add an alternative mode that uses `RuntimeUI` from `@golem-forge/core`.

**Modified: `services/browser-runtime.ts`**

```typescript
import { RuntimeUI, createRuntimeUI } from "@golem-forge/core";

export interface BrowserRuntimeOptions {
  worker: WorkerDefinition;
  modelId?: string;
  programId?: string;
  maxIterations?: number;

  // Option A: Callback-based (existing, for backwards compat)
  approvalMode?: ApprovalMode;
  approvalCallback?: ApprovalCallback;
  onStream?: StreamCallback;
  onToolCall?: ToolCallback;

  // Option B: Event-based (new)
  runtimeUI?: RuntimeUI;  // If provided, use events instead of callbacks
}
```

**Key Changes:**
1. If `runtimeUI` is provided, use `runtimeUI.requestApproval()` instead of `BrowserApprovalController`
2. Emit streaming events via `runtimeUI.appendStreaming()` instead of `onStream` callback
3. Emit tool events via `runtimeUI.showToolStarted()` and `runtimeUI.showToolResult()`
4. Remove `BrowserApprovalController` usage when in event mode

**Tasks:**
- [x] Add `runtimeUI?: RuntimeUI` to `BrowserRuntimeOptions`
- [x] Modify `run()` to check for `runtimeUI` and use events instead of callbacks
- [x] Use `runtimeUI.requestApproval()` for approval flow (replaces BrowserApprovalController)
- [x] Emit streaming events via `runtimeUI.appendStreaming()`
- [x] Emit tool events via `runtimeUI.showToolStarted()` and `runtimeUI.showToolResult()`

### Phase 2: Create ChromeAdapter

Create an adapter that bridges BrowserWorkerRuntime to the event bus.

**New File: `services/chrome-adapter.ts`**

```typescript
import {
  BaseUIImplementation,
  UIEventBus,
  createRuntimeUI,
  type RuntimeUI,
  type WorkerDefinition
} from "@golem-forge/core";
import { createBrowserRuntime, type BrowserWorkerRuntime } from "./browser-runtime.js";

export interface ChromeAdapterOptions {
  programId?: string;
  modelId?: string;
}

export class ChromeAdapter extends BaseUIImplementation {
  private runtimeUI: RuntimeUI;
  private options: ChromeAdapterOptions;

  constructor(bus: UIEventBus, options: ChromeAdapterOptions = {}) {
    super(bus);
    this.runtimeUI = createRuntimeUI(bus);
    this.options = options;
  }

  async initialize(): Promise<void> {
    // ChromeAdapter is stateless - no initialization needed
    // Event subscriptions are handled by UIProvider in React
  }

  async shutdown(): Promise<void> {
    // Nothing to clean up
  }

  /**
   * Run a worker with the given input.
   * Emits events to the bus for UI consumption.
   */
  async runWorker(worker: WorkerDefinition, input: string): Promise<void> {
    const runtime = await createBrowserRuntime({
      worker,
      programId: this.options.programId,
      modelId: this.options.modelId,
      runtimeUI: this.runtimeUI,  // Event-based mode
    });

    await runtime.run(input);
  }
}

export function createChromeAdapter(
  bus: UIEventBus,
  options?: ChromeAdapterOptions
): ChromeAdapter {
  return new ChromeAdapter(bus, options);
}
```

**Tasks:**
- [x] Create `services/chrome-adapter.ts`
- [x] Export from `services/index.ts`

### Phase 3: Update Sidepanel with UIProvider

Wrap the sidepanel in UIProvider and use ui-react hooks.

**Modified: `sidepanel.tsx`**

```typescript
import { createUIEventBus } from "@golem-forge/core";
import { UIProvider, useMessages, usePendingApproval } from "@golem-forge/ui-react";
import { ChromeAdapter } from "./services/chrome-adapter.js";

const eventBus = createUIEventBus();
const adapter = new ChromeAdapter(eventBus);

function SidepanelApp() {
  return (
    <UIProvider bus={eventBus}>
      <ChromeUIStateProvider>
        {/* Existing UI structure */}
      </ChromeUIStateProvider>
    </UIProvider>
  );
}
```

**Tasks:**
- [x] Create event bus instance in sidepanel.tsx
- [x] Wrap app in UIProvider
- [x] Create ChromeUIStateProvider for chrome-specific state (selected program, etc.)
- [x] Initialize ChromeAdapter on mount

### Phase 4: Refactor ChatTab

Replace local state with ui-react hooks.

**Before:**
```typescript
function ChatTab() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [approvalRequest, setApprovalRequest] = useState(null);
  // ... manual state management
}
```

**After:**
```typescript
function ChatTab() {
  const messages = useMessages();
  const pendingApproval = usePendingApproval();
  const { respond } = useApprovalActions();
  const streaming = useStreaming();
  // ... event-driven
}
```

**Tasks:**
- [x] Replace messages useState with useMessages()
- [x] Replace streaming state with useStreaming()
- [x] Replace approvalRequest with usePendingApproval()
- [x] Use useApprovalActions().respond() instead of Promise resolver
- [x] Update message rendering to use UIMessage type

### Phase 5: Refactor ApprovalDialog

Convert from Promise-based to event-based approval.

**Before:**
```typescript
<ApprovalDialog
  request={approvalRequest}
  onApprove={() => approvalResolver(true)}
  onDeny={() => approvalResolver(false)}
/>
```

**After:**
```typescript
function ApprovalDialog() {
  const pendingApproval = usePendingApproval();
  const { respond } = useApprovalActions();

  if (!pendingApproval) return null;

  return (
    <Dialog>
      {/* ... */}
      <button onClick={() => respond({ approved: true })}>Approve</button>
      <button onClick={() => respond({ approved: false })}>Deny</button>
      <button onClick={() => respond({ approved: "session" })}>Allow for Session</button>
    </Dialog>
  );
}
```

**Tasks:**
- [x] Remove Promise-based approval from ChatTab
- [x] Use usePendingApproval() hook
- [x] Use useApprovalActions().respond() for decisions
- [x] Add "session" and "always" approval options

### Phase 6: Create Chrome-Specific Context

For state that's unique to Chrome (selected program, settings UI state).

**New File: `contexts/ChromeUIStateContext.tsx`**

```typescript
interface ChromeUIState {
  selectedProgramId: string | null;
  activeTab: "chat" | "settings";
  // Chrome-specific UI state
}

export function ChromeUIStateProvider({ children }) {
  // Manage chrome-specific state
}

export function useChromeUIState(): ChromeUIState;
export function useChromeUIActions();
```

**Tasks:**
- [x] Create `contexts/ChromeUIStateContext.tsx`
- [x] Move selectedProgramId, activeTab to context
- [x] Export hooks for state and actions
- [x] Update components to use hooks


## File Changes Summary

### New Files
| File | Purpose |
|------|---------|
| `services/chrome-adapter.ts` | Event bus bridge for BrowserWorkerRuntime |
| `contexts/ChromeUIStateContext.tsx` | Chrome-specific UI state |
| `contexts/index.ts` | Context exports |
| `components/ApprovalDialog.tsx` | Refactored approval dialog using hooks |

### Modified Files
| File | Changes |
|------|---------|
| `services/browser-runtime.ts` | Add `runtimeUI` option, emit events when provided |
| `services/index.ts` | Export ChromeAdapter |
| `sidepanel.tsx` | Add UIProvider, event bus initialization, use hooks |

### Unchanged Files
| File | Reason |
|------|--------|
| `services/worker-manager.ts` | Already well-abstracted |
| `services/ai-service.ts` | Provider logic unchanged |
| `services/opfs-sandbox.ts` | File operations unchanged |
| `storage/*.ts` | Storage logic unchanged |
| `background.ts` | Lifecycle unchanged |
| `popup.tsx` | Minimal UI, no event bus needed |

## Benefits

1. **Code Reuse**: Share state management with CLI
2. **Consistency**: Same architecture across platforms
3. **Testability**: Event-based communication easier to test
4. **Debugging**: Event log provides visibility into state changes
5. **Session Approvals**: Built-in support for "allow for session" patterns
6. **Streaming**: Consistent streaming behavior with CLI

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking existing functionality | Incremental migration, keep services unchanged |
| Bundle size increase | ui-react already a dependency, minimal impact |
| React 19 compatibility | Already using React 19 |
| Event bus overhead | Minimal - just pub/sub |

## Success Criteria

- [x] Chrome extension builds without errors
- [x] All existing tests pass
- [x] Chat functionality works (send message, receive response)
- [x] Streaming displays in real-time
- [x] Approval dialogs work with session/always options
- [x] Settings persist correctly
- [x] Program selection works

## References

- InkAdapter implementation: `packages/cli/src/ui/ink/InkAdapter.tsx`
- UIProvider: `packages/ui-react/src/providers/UIProvider.tsx`
- Event types: `packages/core/src/ui-event-bus.ts`
- Existing browser-extension-implementation-plan: `docs/notes/browser-extension-implementation-plan.md`
