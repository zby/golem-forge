# UI Interface Design Exploration

## Problem Statement

We need a common UI interface that works across platforms (CLI, browser extension, potential future UIs). The current architecture has:

- `UIAdapter` in CLI package - mixes async methods and callback registration
- Browser package - completely separate React UI with no shared interface
- `@golem-forge/core` - shared types but no UI abstraction

The goal is to define a platform-agnostic UI interface in `@golem-forge/core` that both CLI and browser can implement.

## Core Design Tension

**Event-driven architecture** is ideal for UI:
- Decouples runtime from rendering
- Natural fit for React (browser) and Ink (CLI)
- Allows UI to batch/debounce updates
- Non-blocking, responsive

**But some operations must block:**
- `requestApproval()` - runtime cannot proceed until user decides
- `getUserInput()` - runtime needs the user's message to continue
- These create a synchronization point between runtime and UI

This is the fundamental tension: **how do we maintain event-driven architecture while supporting blocking operations?**

## Analysis of Communication Patterns

### Pattern 1: Direct Method Calls (Current UIAdapter)

```typescript
interface UIAdapter {
  displayMessage(msg: Message): Promise<void>;        // Fire-and-forget
  requestApproval(req: ApprovalRequest): Promise<ApprovalResponse>;  // Blocking
  onInterrupt(handler: () => void): void;             // Callback registration
}
```

**Analysis:**
- Simple to understand and use
- Mixes three paradigms: async display, blocking requests, callbacks
- Tight coupling - runtime directly calls UI methods
- UI implementation must handle concurrency (what if two approvals requested simultaneously?)
- Testing requires mocking the entire interface

**Verdict:** Works but architecturally inconsistent.

### Pattern 2: Pure Event Emitter

```typescript
// Runtime emits
ui.emit('message', { role: 'assistant', content: '...' });
ui.emit('approvalRequired', { id: 'req-1', type: 'tool_call', ... });

// UI emits back
ui.emit('approvalResponse', { requestId: 'req-1', approved: true });
ui.emit('userInput', { content: 'hello' });

// Runtime subscribes
ui.on('approvalResponse', (response) => { ... });
```

**How to make approval "blocking":**
```typescript
async function requestApproval(request: ApprovalRequest): Promise<ApprovalResponse> {
  const requestId = generateId();

  return new Promise((resolve) => {
    const unsubscribe = ui.on('approvalResponse', (response) => {
      if (response.requestId === requestId) {
        unsubscribe();
        resolve(response);
      }
    });

    ui.emit('approvalRequired', { requestId, ...request });
  });
}
```

**Analysis:**
- Consistent paradigm - everything is events
- Requires correlation IDs for request/response matching
- Natural fit for distributed systems (could work across process boundaries)
- UI doesn't know/care that runtime is "blocking" - it just receives events and emits responses
- Multiple pending approvals handled naturally (each has unique ID)
- More boilerplate for simple cases
- Risk of orphaned listeners if responses never come (need timeouts)

**Verdict:** Clean architecture but adds complexity.

### Pattern 3: Command/Query Separation (CQRS-lite)

```typescript
interface UICommands {
  // Commands: fire-and-forget, no return value
  showMessage(msg: Message): void;
  showToolResult(result: ToolResult): void;
  showStatus(status: StatusUpdate): void;
  showWorkerUpdate(update: WorkerUpdate): void;
}

interface UIQueries {
  // Queries: blocking, return values
  requestApproval(request: ApprovalRequest): Promise<ApprovalResponse>;
  getUserInput(prompt?: string): Promise<string>;
}

interface UISubscriptions {
  // Subscriptions: user-initiated events
  onInterrupt(handler: () => void): Unsubscribe;
  onManualToolInvoke(handler: (tool: string, args: Record<string, unknown>) => void): Unsubscribe;
}

interface UIInterface extends UICommands, UIQueries, UISubscriptions {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}
```

**Analysis:**
- Clear categorization of operations by their nature
- Commands are explicitly fire-and-forget
- Queries are explicitly blocking
- Subscriptions are explicitly for user-initiated actions
- Still method-based, not event-based
- Implementation can choose to use events internally

**Verdict:** Good conceptual clarity, pragmatic.

### Pattern 4: Actor Model

```typescript
// Runtime and UI are actors that send messages
interface RuntimeActor {
  receive(msg: UIMessage): void;
  send(msg: RuntimeMessage): void;
}

interface UIActor {
  receive(msg: RuntimeMessage): void;
  send(msg: UIMessage): void;
}

type RuntimeMessage =
  | { type: 'SHOW_MESSAGE', payload: Message }
  | { type: 'REQUEST_APPROVAL', payload: ApprovalRequest & { replyTo: string } }
  | { type: 'REQUEST_INPUT', payload: { prompt: string, replyTo: string } };

type UIMessage =
  | { type: 'APPROVAL_RESPONSE', payload: ApprovalResponse & { requestId: string } }
  | { type: 'USER_INPUT', payload: { content: string, requestId: string } }
  | { type: 'INTERRUPT', payload: { reason?: string } };
```

**Analysis:**
- Very clean separation - actors only communicate via messages
- Natural for concurrent/distributed systems
- Request/response via `replyTo` pattern
- Could run UI in separate process/worker
- Heavier abstraction than needed for simple cases
- Requires message routing infrastructure

**Verdict:** Overkill for our needs, but interesting for future scaling.

### Pattern 5: Reactive Streams

```typescript
interface UIInterface {
  // Runtime pushes display updates
  display$: Observer<DisplayEvent>;

  // UI pushes user actions
  actions$: Observable<UserAction>;

  // For blocking operations, runtime subscribes to filtered action stream
  // and uses firstValueFrom() or similar
}

// Usage:
ui.display$.next({ type: 'message', payload: msg });

const approval = await firstValueFrom(
  ui.actions$.pipe(
    filter(a => a.type === 'approvalResponse' && a.requestId === id)
  )
);
```

**Analysis:**
- Powerful composition with RxJS operators
- Natural for streaming scenarios (token-by-token output)
- Adds RxJS dependency
- Learning curve for developers unfamiliar with reactive patterns
- Excellent for complex async flows

**Verdict:** Powerful but heavy dependency.

## Deeper Considerations

### 1. Who Owns the Event Loop?

In CLI (Ink), React owns the render loop. The runtime is a separate async flow.
In browser, React also owns rendering, but the runtime might be in a web worker.

The UI interface should not assume co-location. This favors message-passing (Pattern 2 or 4).

### 2. Streaming Text Output

LLM responses stream token-by-token. Options:
- Many small `message` events with deltas
- A `streamStart` / `streamDelta` / `streamEnd` protocol
- Observable/AsyncIterator for the stream

This is naturally event-driven and doesn't need blocking.

### 3. Concurrent Approvals

What if a sub-worker requests approval while parent is also waiting for approval?
- Need to support multiple pending approval dialogs
- UI decides how to present (queue, stack, parallel)
- Runtime just waits for its specific response

This strongly favors correlation IDs (Pattern 2).

### 4. Cancellation and Timeouts

What if user closes the browser tab while approval is pending?
- Runtime's Promise hangs forever
- Need cancellation mechanism (AbortController pattern)
- Or timeout with auto-reject

```typescript
async requestApproval(
  request: ApprovalRequest,
  options?: { signal?: AbortSignal, timeoutMs?: number }
): Promise<ApprovalResponse>
```

### 5. Testing

Event-driven is easier to test:
```typescript
// Emit event, verify UI received it
ui.emit('message', msg);
expect(mockUI.receivedMessages).toContain(msg);

// Simulate user action
mockUI.simulateApproval({ requestId: 'x', approved: true });
expect(runtimeState).toBe('approved');
```

Method-based requires mocking:
```typescript
const mockUI = {
  requestApproval: vi.fn().mockResolvedValue({ approved: true })
};
```

### 6. Serialization Boundary

If UI runs in different process (browser worker, Electron renderer):
- All events must be serializable (no functions, no circular refs)
- Event-based naturally enforces this
- Method-based needs careful interface design

## Recommendation

**Hybrid approach combining Pattern 2 (events) with Pattern 3 (categorization):**

```typescript
/**
 * Display events - fire and forget, runtime to UI
 */
interface DisplayEvents {
  message: DisplayMessage;
  streaming: StreamingUpdate;
  status: StatusNotification;
  toolStarted: ToolStarted;
  toolResult: ToolResult;
  workerUpdate: WorkerUpdate;
  approvalRequired: ApprovalRequest;  // Note: this is a display event
  inputRequired: InputRequest;
}

/**
 * User action events - UI to runtime
 */
interface ActionEvents {
  approvalResponse: ApprovalResponse & { requestId: string };
  userInput: UserInput & { requestId: string };
  interrupt: { reason?: string };
  manualToolInvoke: ManualToolInvocation;
}

/**
 * Core event emitter interface
 */
interface UIEventBus {
  // Type-safe event emission
  emit<K extends keyof DisplayEvents>(event: K, data: DisplayEvents[K]): void;
  emit<K extends keyof ActionEvents>(event: K, data: ActionEvents[K]): void;

  // Type-safe subscriptions
  on<K extends keyof DisplayEvents>(event: K, handler: (data: DisplayEvents[K]) => void): Unsubscribe;
  on<K extends keyof ActionEvents>(event: K, handler: (data: ActionEvents[K]) => void): Unsubscribe;
}

/**
 * High-level runtime API (built on event bus)
 */
interface RuntimeUI {
  readonly bus: UIEventBus;

  // Convenience methods that use events internally
  showMessage(msg: DisplayMessage): void;
  showStatus(status: StatusNotification): void;

  // Blocking methods - emit request event, await response event
  requestApproval(request: Omit<ApprovalRequest, 'id'>): Promise<ApprovalResponse>;
  getUserInput(prompt?: string): Promise<string>;
}

/**
 * High-level UI implementation API
 */
interface UIImplementation {
  readonly bus: UIEventBus;

  // UI calls these to send user actions
  sendApprovalResponse(requestId: string, response: ApprovalResponse): void;
  sendUserInput(requestId: string, input: string): void;
  sendInterrupt(reason?: string): void;

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}
```

**Why this works:**

1. **Pure events at the core** - `UIEventBus` is purely event-driven
2. **Convenience layer for blocking** - `RuntimeUI.requestApproval()` handles correlation internally
3. **Clear separation** - DisplayEvents flow one way, ActionEvents flow the other
4. **Testable** - Can test at event level or method level
5. **Serializable** - Events are plain data, can cross process boundaries
6. **Flexible** - UI implementation only needs to subscribe to DisplayEvents and emit ActionEvents

## Implementation Sketch

```typescript
function createRuntimeUI(bus: UIEventBus): RuntimeUI {
  return {
    bus,

    showMessage(msg) {
      bus.emit('message', msg);
    },

    showStatus(status) {
      bus.emit('status', status);
    },

    async requestApproval(request) {
      const id = crypto.randomUUID();

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          unsubscribe();
          reject(new Error('Approval timeout'));
        }, 5 * 60 * 1000); // 5 minute timeout

        const unsubscribe = bus.on('approvalResponse', (response) => {
          if (response.requestId === id) {
            clearTimeout(timeout);
            unsubscribe();
            resolve(response);
          }
        });

        bus.emit('approvalRequired', { id, ...request });
      });
    },

    async getUserInput(prompt = '> ') {
      const requestId = crypto.randomUUID();

      return new Promise((resolve) => {
        const unsubscribe = bus.on('userInput', (input) => {
          if (input.requestId === requestId) {
            unsubscribe();
            resolve(input.content);
          }
        });

        bus.emit('inputRequired', { requestId, prompt });
      });
    }
  };
}
```

## Open Questions

1. **Should the event bus be shared or should runtime and UI have separate instances?**
   - Shared: simpler, direct communication
   - Separate: cleaner boundaries, could add middleware/logging

2. **How to handle UI reconnection (browser refresh)?**
   - Need to replay pending approval requests
   - Or cancel them and let runtime retry

3. **Should streaming be a special event type or just frequent message events?**
   - Special type allows UI to optimize rendering
   - Frequent events are simpler but noisier

4. **Where does manual tool execution fit?**
   - User invokes tool → UI emits `manualToolInvoke`
   - Runtime executes → emits `toolResult`
   - Straightforward event flow

5. **How to version the event protocol for future changes?**
   - Add version field to events?
   - Separate event schemas?

## Next Steps

1. Get feedback on this design
2. Prototype the event bus and RuntimeUI wrapper
3. Adapt InkAdapter to implement UIImplementation
4. Create BrowserUIImplementation for the extension
5. Migrate runtime to use RuntimeUI instead of direct UIAdapter calls

---

## Appendix: Exploration Findings (from ink-adoption-wip branch)

The following patterns and structures emerged from an experimental Ink UI implementation. They are documented here as **exploration findings**, not as a specification. The final architecture may differ significantly.

### A. State Management Patterns Explored

We experimented with separating state management into platform-agnostic modules. Key observations:

#### A.1 Approval State

Explored managing approval patterns, auto-approval logic, and approval history as a separate module.

```typescript
/**
 * Risk levels for approval requests
 */
export type ApprovalRisk = "low" | "medium" | "high";

/**
 * Types of operations that require approval
 */
export type ApprovalType = "tool_call" | "file_write" | "command";

/**
 * Pattern for matching approval requests.
 * Used for "session" and "always" auto-approval.
 */
export interface ApprovalPattern {
  /** Type of operation to match */
  type: ApprovalType;
  /** Pattern to match against description (substring match) */
  descriptionPattern?: string;
  /** Maximum risk level to auto-approve */
  maxRisk?: ApprovalRisk;
}

/**
 * Entry in approval history
 */
export interface ApprovalHistoryEntry {
  request: ApprovalRequestData;
  result: ApprovalResultData;
  timestamp: number;
}

/**
 * Request data for approval (UI-agnostic subset)
 */
export interface ApprovalRequestData {
  type: ApprovalType;
  description: string;
  risk: ApprovalRisk;
}

/**
 * Result data for approval
 */
export type ApprovalResultData =
  | { approved: true }
  | { approved: false; reason?: string }
  | { approved: "always" }
  | { approved: "session" };

/**
 * Core approval state (platform-agnostic)
 */
export interface ApprovalState {
  sessionApprovals: ApprovalPattern[];
  alwaysApprovals: ApprovalPattern[];
  history: ApprovalHistoryEntry[];
}

// Functions:
// - createApprovalState(initialAlwaysApprovals?): ApprovalState
// - matchesApprovalPattern(request, pattern): boolean
// - isAutoApproved(state, request): boolean
// - findMatchingPattern(state, request): ApprovalPattern | undefined
// - createPatternFromRequest(request, includeDescription?): ApprovalPattern
// - addApproval(state, request, result): ApprovalState
// - clearSessionApprovals(state): ApprovalState
// - clearApprovalHistory(state): ApprovalState
// - getApprovalStats(state): { sessionCount, alwaysCount, historyCount, approvedCount, deniedCount }
```

**Observations:**
- Pure functions returning new state worked well for testability
- Pattern matching on type + description + risk level provided flexibility
- Distinguishing "session" vs "always" approvals was useful
- Risk level comparison (low < medium < high) enabled "approve up to X risk" patterns

#### A.2 Worker State

Explored managing the worker tree hierarchy. Workers can spawn sub-workers, forming a tree.

```typescript
/**
 * Status of a worker task
 */
export type WorkerStatus = "pending" | "running" | "complete" | "error";

/**
 * A node in the worker tree
 */
export interface WorkerNode {
  id: string;
  task: string;
  status: WorkerStatus;
  parentId?: string;
  children: string[];
  depth: number;
}

/**
 * Information about a worker for display purposes
 */
export interface WorkerInfo {
  id: string;
  depth: number;
  task: string;
}

/**
 * Progress information for a task (used by UIAdapter)
 */
export interface TaskProgress {
  id: string;
  description: string;
  status: WorkerStatus;
  depth: number;
  parentId?: string;
}

/**
 * Worker tree state
 */
export interface WorkerState {
  workers: Map<string, WorkerNode>;
  activeWorkerId: string | null;
  rootWorkerId: string | null;
}

// Functions:
// - createWorkerState(): WorkerState
// - workerFromProgress(progress, existingChildren?): WorkerNode
// - addWorker(state, worker): WorkerState
// - updateWorkerStatus(state, id, status): WorkerState
// - setActiveWorker(state, id): WorkerState
// - removeWorker(state, id): WorkerState
// - updateFromProgress(state, progress): WorkerState
// - getWorkerPath(state, workerId?): WorkerInfo[]
// - getActiveWorker(state): WorkerNode | null
// - getWorkerList(state): WorkerNode[]
// - getWorkersInTreeOrder(state): WorkerNode[]
// - getWorkerStats(state): { total, pending, running, complete, error }
// - clearWorkers(): WorkerState
```

**Observations:**
- Tree structure with parent/child relationships modeled worker delegation well
- `getWorkerPath()` (root to current worker) was essential for approval context display
- Idempotent `updateFromProgress()` simplified integration with runtime events
- Depth-first traversal gave intuitive tree display order

#### A.3 Message State

Explored managing conversation history including messages, tool results, status updates, and streaming.

```typescript
/**
 * Role of a message in the conversation
 */
export type MessageRole = "user" | "assistant" | "system";

/**
 * A message in the conversation
 */
export interface Message {
  role: MessageRole;
  content: string;
  timestamp?: number;
}

/**
 * Status update types
 */
export type StatusType = "info" | "warning" | "error";

/**
 * Status update for display
 */
export interface StatusUpdate {
  type: StatusType;
  message: string;
}

/**
 * Tool result status
 */
export type ToolResultStatus = "success" | "error" | "interrupted";

/**
 * Simplified tool result for message display
 */
export interface ToolResultData {
  toolName: string;
  toolCallId: string;
  status: ToolResultStatus;
  summary?: string;
  error?: string;
  durationMs: number;
}

/**
 * Extended message types for the UI
 */
export type UIMessage =
  | { type: "message"; message: Message }
  | { type: "tool_result"; result: ToolResultData }
  | { type: "status"; status: StatusUpdate }
  | { type: "worker_start"; workerId: string; task: string }
  | { type: "worker_complete"; workerId: string; success: boolean };

/**
 * Message state
 */
export interface MessageState {
  messages: UIMessage[];
  streamingContent: string | null;
  isStreaming: boolean;
}

// Functions:
// - createMessageState(): MessageState
// - addMessage(state, message): MessageState
// - addToolResult(state, result): MessageState
// - addStatus(state, status): MessageState
// - addWorkerStart(state, workerId, task): MessageState
// - addWorkerComplete(state, workerId, success): MessageState
// - setStreaming(state, content): MessageState
// - appendStreaming(state, content): MessageState
// - commitStreaming(state): MessageState
// - clearMessages(): MessageState
// - getConversationMessages(state): Message[]
// - getLastMessageByRole(state, role): Message | undefined
// - getMessageStats(state): { total, messages, toolResults, statuses, workerEvents }
// - isAwaitingResponse(state): boolean
```

**Observations:**
- Unified `UIMessage` discriminated union simplified rendering logic
- Separate streaming buffer avoided partial message updates in history
- Integrating worker start/complete events into message flow gave coherent timeline
- `isAwaitingResponse()` helper was useful for UI state decisions

---

### B. Theme System Explored

Experimented with a three-layer theming system for terminal colors:

```typescript
/**
 * Base color palette
 */
export interface ColorPalette {
  background: string;
  foreground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  gray: string;
}

/**
 * Semantic color tokens - colors by purpose
 */
export interface SemanticColors {
  text: {
    primary: string;
    secondary: string;
    muted: string;
    accent: string;
  };
  status: {
    success: string;
    error: string;
    warning: string;
    info: string;
  };
  border: {
    default: string;
    focused: string;
    muted: string;
  };
  worker: {
    active: string;
    pending: string;
    complete: string;
    error: string;
  };
  risk: {
    low: string;
    medium: string;
    high: string;
  };
  diff: {
    added: string;
    removed: string;
    context: string;
  };
}

/**
 * Complete theme definition
 */
export interface Theme {
  name: string;
  palette: ColorPalette;
  colors: SemanticColors;
}
```

**Observations:**
- Separating palette (raw colors) from semantic tokens (purpose) made theming flexible
- Semantic tokens for risk, status, worker state, and diff covered most UI needs
- This structure could potentially map to CSS variables for browser implementation
- Question: Should themes live in core or be UI-specific?

---

### C. Imperative-to-Declarative Bridge Pattern

One challenge was connecting the imperative adapter API (method calls from runtime) to React's declarative context system. We explored a "Controller Bridge" pattern:

```typescript
/**
 * Bridge component that exposes context actions to the adapter
 */
function ControllerBridge({ onReady }: { onReady: (actions: ContextActions) => void }): null {
  const messages = useMessagesActions();
  const approval = useApprovalActions();
  const workers = useWorkerActions();
  const ui = useUIActions();

  useEffect(() => {
    onReady({ messages, approval, workers, ui });
  }, [messages, approval, workers, ui, onReady]);

  return null;
}

/**
 * App wrapper that includes the controller bridge
 */
function AppWithBridge({ onReady, cwd, branch }: AppWithBridgeProps): React.ReactElement {
  return (
    <App cwd={cwd} branch={branch}>
      <ControllerBridge onReady={onReady} />
    </App>
  );
}

/**
 * InkAdapter class wraps the React app
 */
class InkAdapter implements UIAdapter {
  private actions?: ContextActions;
  private instance?: ReturnType<typeof render>;

  async initialize(): Promise<void> {
    return new Promise((resolve) => {
      this.instance = render(
        <AppWithBridge
          onReady={(actions) => {
            this.actions = actions;
            resolve();
          }}
        />
      );
    });
  }

  async requestApproval(request: UIApprovalRequest): Promise<UIApprovalResult> {
    return this.actions!.approval.requestApproval(request);
  }

  // ... other methods delegate to this.actions
}
```

**Observations:**
- The bridge component runs inside React's context tree, capturing action dispatchers
- `initialize()` returning a Promise that resolves when contexts are ready worked well
- This pattern bridges imperative and declarative worlds but adds complexity
- With an event-based architecture, this bridge might be simplified or eliminated

---

### D. React Context Structure Explored

The Ink prototype used five React contexts:

| Context | Purpose |
|---------|---------|
| `ThemeContext` | Color theme access |
| `WorkerContext` | Worker tree state (uses `worker-state.ts` internally) |
| `ApprovalContext` | Pending approval requests |
| `MessagesContext` | Conversation history (uses `message-state.ts` internally) |
| `UIStateContext` | UI mode, input focus, pending requests |

Each context follows the "dual context" pattern:
- State context: provides current state value
- Actions context: provides dispatch functions

```typescript
// Example: ApprovalContext

const ApprovalStateContext = createContext<ApprovalContextState | null>(null);
const ApprovalActionsContext = createContext<ApprovalContextActions | null>(null);

interface ApprovalContextState {
  pendingRequest: UIApprovalRequest | null;
}

interface ApprovalContextActions {
  requestApproval: (request: UIApprovalRequest) => Promise<UIApprovalResult>;
}

// Hooks for consumers
export function useApprovalState(): ApprovalContextState { ... }
export function useApprovalActions(): ApprovalContextActions { ... }
```

**Observations:**
- Dual context pattern (state + actions) reduced unnecessary re-renders
- Five contexts might be over-engineered; could potentially consolidate
- With event-based architecture, contexts might just subscribe to event bus
- Question: How much of this complexity is needed vs incidental?

---

### E. Component Hierarchy Explored

```
App (prototype)
├── ThemeProvider
│   └── WorkerProvider
│       └── ApprovalProvider
│           └── MessagesProvider
│               └── UIStateProvider
│                   ├── ControllerBridge (captures actions)
│                   └── AppLayout
│                       ├── Header
│                       ├── Composer (message list + input)
│                       │   ├── MessageList
│                       │   │   ├── UserMessage
│                       │   │   ├── AssistantMessage
│                       │   │   ├── SystemMessage
│                       │   │   ├── WorkerMessage
│                       │   │   ├── StatusMessage
│                       │   │   └── ToolResultDisplay
│                       │   └── InputPrompt
│                       ├── ApprovalDialog (modal when approval pending)
│                       └── Footer
```

**Observations:**
- Deep provider nesting worked but felt heavy
- ApprovalDialog as conditional modal worked for single approval; unclear for concurrent
- Component names and structure are just one possible decomposition
- Browser implementation might have very different component structure

---

### F. Open Questions from Exploration

1. **State module granularity**: Are three separate modules (approval, worker, message) the right split, or should they be combined/split differently?

2. **Event bus vs contexts**: With an event-driven architecture, do we still need React contexts, or can components subscribe directly to the event bus?

3. **Streaming complexity**: The streaming buffer approach worked but added state complexity. Is there a simpler model?

### G. Decisions Made

1. **Theme sharing**: Themes do not need to be shared between platforms. Each UI (terminal, browser) can have its own theme system appropriate to the platform.

2. **Concurrent approvals**: For simplicity, approvals will be serialized - the runtime blocks until the user resolves the current approval before another can be requested. This avoids UI complexity of managing multiple pending dialogs.

3. **Testing**: Integration tests will be needed to properly test UI implementations. Unit tests can cover the event bus and state management, but end-to-end behavior requires integration testing.
