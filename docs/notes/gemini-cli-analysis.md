# Gemini CLI Analysis: What We Can Borrow

## Executive Summary

Gemini CLI is Google's open-source terminal AI agent built with Ink (React for CLIs). It has Apache 2.0 license, making code adaptation straightforward. This analysis identifies architectural patterns and specific components we could adopt for golem-forge.

---

## Architecture Comparison

### Communication Patterns

| Aspect | Gemini CLI | Golem Forge |
|--------|-----------|-------------|
| **Core Pattern** | MessageBus with correlation IDs | UIEventBus (pub/sub) |
| **Confirmations** | Request/response with timeout | Callback-based |
| **Direction** | Bidirectional typed messages | Display (runtime→UI) + Action (UI→runtime) |

**Gemini CLI's MessageBus** uses a request/response pattern with correlation IDs:
```typescript
// Their approach - request waits for correlated response
const response = await messageBus.request('TOOL_CONFIRMATION_REQUEST', {
  correlationId: uuid(),
  toolName: 'shell',
  ...
}); // Resolves when matching response arrives, or times out after 60s
```

**Our UIEventBus** uses simpler pub/sub:
```typescript
// Our approach - fire and forget with separate subscription
bus.emit('approvalRequest', request);
bus.on('approvalResponse', handler);
```

**Assessment**: Their correlation ID pattern is more robust for request/response scenarios. We could adopt this for approval flows where we need guaranteed matching between request and response.

---

### State Management

| Aspect | Gemini CLI | Golem Forge |
|--------|-----------|-------------|
| **Container** | Single AppContainer with 40+ state vars | Distributed across 6 providers |
| **Pattern** | Reducer-based for extensions | Dedicated state modules per concern |
| **Contexts** | 13+ contexts | 6 contexts |

**Gemini CLI's AppContainer** is a mega-component managing:
- Authentication state
- Dialog visibility (theme, settings, model, permissions, etc.)
- Streaming state
- Terminal dimensions
- Session statistics
- IDE integration
- Extension updates

They aggregate into `UIState` (80+ properties) and `UIActions` (27+ callbacks).

**Our approach** distributes state across:
- `UIStateProvider` - mode, focus, errors
- `WorkerProvider` - worker tree
- `ApprovalProvider` - approval patterns/pending
- `MessagesProvider` - message history
- `ManualToolsProvider` - manual tool state
- `EventBusProvider` - bus reference

**Assessment**: Our distributed approach is cleaner and more testable. However, we lack:
- Terminal dimension tracking
- Dialog management system
- Session/history persistence
- Streaming state coordination

---

### Policy System

Gemini CLI has a sophisticated policy engine:

```
packages/core/src/policy/
├── policy-engine.ts      # Core execution logic
├── toml-loader.ts        # File-based policy loading
├── config.ts             # Policy configuration
└── policies/             # TOML policy definitions
```

The MessageBus consults policies before confirmations:
- **Allow**: Auto-approve
- **Deny**: Auto-reject with `TOOL_POLICY_REJECTION` event
- **Ask**: Pass to UI for interactive confirmation

**Our ApprovalController** is simpler:
- Modes: `interactive`, `approve_all`, `auto_deny`
- Session caching with `ApprovalMemory`
- No file-based policy loading

**Opportunity**: We could adopt their TOML-based policy system for program-specific approval rules (`.golem-forge/policies/`).

---

### Hook System

Gemini CLI has a comprehensive hook system:

```typescript
// Hook lifecycle events
fireSessionStartHook()
fireSessionEndHook()
firePreCompressionHook()

// Components
HookRegistry    // Storage
HookRunner      // Execution
HookAggregator  // Result combination
HookPlanner     // Event context
```

**We don't have** a hook system. This enables:
- Pre/post tool execution hooks
- Session lifecycle events
- Custom user scripts

---

## UI Components Worth Borrowing

### 1. Theme System (High Value)

**Their structure:**
```
packages/cli/src/ui/themes/
├── theme.ts              # Core interface
├── theme-manager.ts      # Runtime switching
├── semantic-tokens.ts    # Purpose-based colors
├── color-utils.ts        # Color manipulation
├── default.ts
├── dracula.ts
├── github-dark.ts
└── ... (22 themes total)
```

**Key pattern** - Proxy-based color access:
```typescript
const Colors = {
  get foreground() { return themeManager.getActiveTheme().colors.foreground; },
  get diffAdded() { return themeManager.getActiveTheme().colors.diffAdded; },
  // ...
};
```

This allows runtime theme switching without prop drilling.

**Our current state:**
- Single `defaultTheme` object
- Direct color access via `useTheme()` hook
- No theme switching UI

**Adoption path:**
1. Create `ThemeManager` class
2. Add theme registry
3. Port popular themes (dracula, github-dark, etc.)
4. Add `ThemeDialog` component

---

### 2. Scroll System (Medium Value)

**Their ScrollProvider** handles:
- Component registration via `useScrollable` hook
- Mouse wheel events
- Scrollbar dragging
- Nested scrollable component prioritization
- Event batching for performance

```typescript
// Components register themselves
const { scrollRef } = useScrollable({
  getScrollTop: () => ref.current?.scrollTop ?? 0,
  setScrollTop: (v) => { if (ref.current) ref.current.scrollTop = v; },
});
```

**We don't have** scroll management. Ink's default scrolling is limited.

**Adoption path:** Port their `ScrollProvider` and `useScrollable` hook.

---

### 3. Dialog Manager (Medium Value)

**Their dialog system** centralizes dialog state:
- `DialogManager` component coordinates visibility
- Priority handling (which dialog shows when multiple requested)
- Keyboard shortcuts for dialog actions

**Our current state:**
- `ApprovalDialog` is standalone
- No dialog coordination
- No priority system

**Adoption path:**
1. Create `DialogManager` component
2. Add dialog state to `InkUIStateContext`
3. Implement priority queue for dialogs

---

### 4. Input Completion Hooks (Medium Value)

**Their hooks:**
```
useCommandCompletion    # General command completion
useSlashCompletion      # /command completion
useAtCompletion         # @mention completion
useReverseSearchCompletion  # Ctrl+R history search
useInputHistory         # Up/down history navigation
```

**We have** basic `useKeyCommands` but no completion system.

**Adoption path:**
1. Port `useInputHistory` first (most useful)
2. Add `useSlashCompletion` for `/help`, etc.
3. Consider `useReverseSearchCompletion` later

---

### 5. Session Management (High Value)

**Their capabilities:**
- `useSessionBrowser` - Navigate between sessions
- `useSessionResume` - Restore previous conversations
- Checkpointing for long conversations
- History persistence

**We don't have** session persistence. Each run is fresh.

**Adoption path:**
1. Define session storage format
2. Implement session save/load
3. Add session browser UI

---

## Hooks Worth Borrowing

### Borrowed from Gemini CLI's hooks/

| Hook | Purpose | Priority |
|------|---------|----------|
| `useInputHistory` | Up/down arrow history | High |
| `useAnimatedScrollbar` | Visual scrollbar | Low |
| `useMemoryMonitor` | Memory usage tracking | Low |
| `useTimer` | Elapsed time display | Medium |
| `usePhraseCycler` | Loading message rotation | Low |
| `useFocus` | Focus management | Medium |
| `useSelectionList` | List navigation | Medium |

---

## Agent System Comparison

**Gemini CLI's agent architecture:**
```
packages/core/src/agents/
├── registry.ts           # Agent discovery
├── executor.ts           # Task execution
├── invocation.ts         # Lifecycle management
├── codebase-investigator.ts  # Context gathering
├── subagent-tool-wrapper.ts  # Agent composition
```

**Our worker system:**
- Workers are prompt templates with tools
- No agent registry
- No subagent composition

**Opportunity**: Their `subagent-tool-wrapper.ts` pattern could enable workers spawning workers.

---

## Recommended Adoption Roadmap

### Phase 1: Foundation (Quick Wins)
1. ✅ `ink-testing-library` - Done
2. **Input history hook** - Port `useInputHistory`
3. **More component tests** - Test Composer, ApprovalDialog

### Phase 2: Polish
4. **Theme system** - Port theme manager + 3-4 popular themes
5. **Timer hook** - Show elapsed time during tool execution
6. **Dialog manager** - Coordinate multiple dialogs

### Phase 3: Features
7. **Scroll system** - Full scroll provider
8. **Session persistence** - Save/resume conversations
9. **Policy engine** - TOML-based approval rules

### Phase 4: Advanced
10. **Hook system** - Pre/post execution hooks
11. **Correlation IDs** - Request/response matching
12. **Subagent composition** - Workers spawning workers

---

## Code Samples to Port

### 1. Color Proxy Pattern
```typescript
// From: packages/cli/src/ui/colors.ts
export const Colors = {
  get type() { return themeManager.getActiveTheme().colors.type; },
  get foreground() { return themeManager.getActiveTheme().colors.foreground; },
  // ... dynamically resolves based on active theme
};
```

### 2. Scrollbar Calculation
```typescript
// From: packages/cli/src/ui/contexts/ScrollProvider.tsx
const thumbHeight = (innerHeight / scrollHeight) * innerHeight;
const maxScrollTop = scrollHeight - innerHeight;
const maxThumbY = innerHeight - thumbHeight;
const currentThumbY = (scrollTop / maxScrollTop) * maxThumbY;
```

### 3. Request/Response with Correlation
```typescript
// From: packages/core/src/confirmation-bus/message-bus.ts
async request(type, payload) {
  const correlationId = uuid();
  const responsePromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timeout')), 60000);
    this.once(responseType, (response) => {
      if (response.correlationId === correlationId) {
        clearTimeout(timeout);
        resolve(response);
      }
    });
  });
  this.emit(type, { ...payload, correlationId });
  return responsePromise;
}
```

---

## Summary

| Category | What to Borrow | Effort | Value |
|----------|---------------|--------|-------|
| Testing | ink-testing-library | ✅ Done | High |
| Themes | Theme manager + themes | Medium | High |
| Scrolling | ScrollProvider | Medium | Medium |
| History | useInputHistory | Low | High |
| Dialogs | DialogManager pattern | Medium | Medium |
| Sessions | Session persistence | High | High |
| Policies | TOML policy engine | High | Medium |
| Hooks | Hook system | High | Medium |
| Correlation | Request/response IDs | Low | Medium |

The most impactful items are:
1. **Theme system** - Immediate UX improvement
2. **Input history** - Expected CLI behavior
3. **Session persistence** - Conversation continuity
