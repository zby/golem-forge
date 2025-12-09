# Chrome Extension Architecture Update Plan

**Status:** Planning
**Date:** 2025-12-09

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

### Phase 1: Create ChromeAdapter

Create an adapter that bridges BrowserWorkerRuntime to the event bus.

**New File: `services/chrome-adapter.ts`**

```typescript
import { BaseUIImplementation, UIEventBus, createRuntimeUI } from "@golem-forge/core";
import { BrowserWorkerRuntime, createBrowserRuntime } from "./browser-runtime.js";

export class ChromeAdapter extends BaseUIImplementation {
  private runtime?: BrowserWorkerRuntime;

  async initialize(): Promise<void> {
    // Set up event subscriptions
    this.bus.on("userInput", (event) => this.handleUserInput(event));
    this.bus.on("approvalResponse", (event) => this.handleApprovalResponse(event));
  }

  async runWorker(workerDef: WorkerDefinition, input: string): Promise<void> {
    const runtimeUI = createRuntimeUI(this.bus);

    this.runtime = await createBrowserRuntime({
      worker: workerDef,
      runtimeUI,  // Event-based UI
      // ... other options
    });

    await this.runtime.run(input);
  }
}
```

**Tasks:**
- [ ] Create `services/chrome-adapter.ts`
- [ ] Implement event subscriptions for userInput, approvalResponse, interrupt
- [ ] Emit events: message, streaming, approvalRequired, toolResult, status
- [ ] Wire BrowserWorkerRuntime to use RuntimeUI instead of callbacks

### Phase 2: Update Sidepanel with UIProvider

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
- [ ] Create event bus instance in sidepanel.tsx
- [ ] Wrap app in UIProvider
- [ ] Create ChromeUIStateProvider for chrome-specific state (selected program, etc.)
- [ ] Initialize ChromeAdapter on mount

### Phase 3: Refactor ChatTab

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
- [ ] Replace messages useState with useMessages()
- [ ] Replace streaming state with useStreaming()
- [ ] Replace approvalRequest with usePendingApproval()
- [ ] Use useApprovalActions().respond() instead of Promise resolver
- [ ] Update message rendering to use UIMessage type

### Phase 4: Refactor ApprovalDialog

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
- [ ] Remove Promise-based approval from ChatTab
- [ ] Use usePendingApproval() hook
- [ ] Use useApprovalActions().respond() for decisions
- [ ] Add "session" and "always" approval options

### Phase 5: Create Chrome-Specific Context

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
- [ ] Create `contexts/ChromeUIStateContext.tsx`
- [ ] Move selectedProgramId, activeTab to context
- [ ] Export hooks for state and actions
- [ ] Update components to use hooks

### Phase 6: Update BrowserWorkerRuntime Integration

Modify how BrowserWorkerRuntime integrates with the event system.

**Current:** Callbacks (onStream, onToolCall)
**Target:** RuntimeUI from event bus

**Tasks:**
- [ ] Update createBrowserRuntime to accept RuntimeUI
- [ ] Remove callback-based streaming
- [ ] Emit events through RuntimeUI.emit()
- [ ] Handle approvals through RuntimeUI.requestApproval()

## File Changes Summary

### New Files
| File | Purpose |
|------|---------|
| `services/chrome-adapter.ts` | Event bus bridge for BrowserWorkerRuntime |
| `contexts/ChromeUIStateContext.tsx` | Chrome-specific UI state |
| `contexts/index.ts` | Context exports |

### Modified Files
| File | Changes |
|------|---------|
| `sidepanel.tsx` | Add UIProvider, event bus initialization |
| `services/browser-runtime.ts` | Accept RuntimeUI, emit events |
| Component files | Use ui-react hooks instead of local state |

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

- [ ] Chrome extension builds without errors
- [ ] All existing tests pass
- [ ] Chat functionality works (send message, receive response)
- [ ] Streaming displays in real-time
- [ ] Approval dialogs work with session/always options
- [ ] Settings persist correctly
- [ ] Program selection works

## References

- InkAdapter implementation: `packages/cli/src/ui/ink/InkAdapter.tsx`
- UIProvider: `packages/ui-react/src/providers/UIProvider.tsx`
- Event types: `packages/core/src/ui-event-bus.ts`
- Existing browser-extension-implementation-plan: `docs/notes/browser-extension-implementation-plan.md`
