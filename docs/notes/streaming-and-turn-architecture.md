# Plan: Streaming, Turn Abstraction, and Tool Queue

## Overview

This plan covers three related improvements to the chat loop architecture:

1. **StreamText Support** - Real-time response streaming
2. **Turn Abstraction** - Clean encapsulation of conversation turns
3. **Tool Queue** - Sequential tool execution option

These changes are designed to be incremental and backwards-compatible.

---

## Phase 1: Turn Abstraction

**Goal**: Create a `Turn` class that encapsulates a single conversation turn, making the code more testable and preparing for streaming.

### 1.1 Create Turn Types

**File**: `packages/cli/src/runtime/turn.ts`

```typescript
/**
 * Events emitted during a turn
 */
export type TurnEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'text_done'; text: string }
  | { type: 'tool_call'; toolCallId: string; toolName: string; args: Record<string, unknown> }
  | { type: 'tool_result'; toolCallId: string; toolName: string; output: unknown; isError: boolean }
  | { type: 'finished'; finishReason: string; usage?: { input: number; output: number } }
  | { type: 'error'; error: Error };

/**
 * Turn state
 */
export type TurnState = 'pending' | 'streaming' | 'tool_execution' | 'complete' | 'error';

/**
 * Turn configuration
 */
export interface TurnConfig {
  model: LanguageModel;
  messages: ModelMessage[];
  tools?: Record<string, Tool>;
  toolExecutor?: ToolExecutor;
  signal?: AbortSignal;
}
```

### 1.2 Implement Turn Class (Non-Streaming First)

```typescript
/**
 * Represents a single conversation turn.
 *
 * A turn is: user message → LLM response → (optional tool calls → tool results → LLM response)*
 */
export class Turn {
  private config: TurnConfig;
  private state: TurnState = 'pending';
  private accumulatedText = '';
  private toolCalls: ToolCall[] = [];

  constructor(config: TurnConfig) {
    this.config = config;
  }

  /**
   * Execute the turn, yielding events as they occur.
   * Initial implementation: non-streaming (wraps generateText)
   */
  async *run(): AsyncGenerator<TurnEvent> {
    this.state = 'streaming';

    try {
      const result = await generateText({
        model: this.config.model,
        messages: this.config.messages,
        tools: this.config.tools,
        abortSignal: this.config.signal,
      });

      // Emit text (as single chunk for now, streaming comes later)
      if (result.text) {
        this.accumulatedText = result.text;
        yield { type: 'text_done', text: result.text };
      }

      // Emit tool calls
      if (result.toolCalls?.length) {
        this.state = 'tool_execution';
        for (const tc of result.toolCalls) {
          yield {
            type: 'tool_call',
            toolCallId: tc.toolCallId,
            toolName: tc.toolName,
            args: tc.input ?? tc.args ?? {},
          };
        }
        this.toolCalls = result.toolCalls;
      }

      yield {
        type: 'finished',
        finishReason: result.finishReason ?? 'stop',
        usage: result.usage ? {
          input: result.usage.inputTokens ?? 0,
          output: result.usage.outputTokens ?? 0,
        } : undefined,
      };

      this.state = 'complete';
    } catch (err) {
      this.state = 'error';
      yield { type: 'error', error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  getState(): TurnState { return this.state; }
  getText(): string { return this.accumulatedText; }
  getToolCalls(): ToolCall[] { return this.toolCalls; }
}
```

### 1.3 Refactor WorkerRuntime to Use Turn

**Changes to** `packages/cli/src/runtime/worker.ts`:

```typescript
async run(input: RunInput): Promise<WorkerResult> {
  // ... setup code ...

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Create turn
    const turn = new Turn({
      model: this.model,
      messages,
      tools: hasTools ? this.tools : undefined,
      signal: this.options.interruptSignal?.signal,
    });

    // Process turn events
    let hasToolCalls = false;
    for await (const event of turn.run()) {
      switch (event.type) {
        case 'text_done':
          // Emit to UI
          this.runtimeUI?.streamText(event.text);
          break;

        case 'tool_call':
          hasToolCalls = true;
          // Will be handled after turn completes
          break;

        case 'finished':
          totalInputTokens += event.usage?.input ?? 0;
          totalOutputTokens += event.usage?.output ?? 0;
          break;

        case 'error':
          throw event.error;
      }
    }

    if (!hasToolCalls) {
      return { success: true, response: turn.getText(), ... };
    }

    // Execute tools and continue loop
    const toolCalls = turn.getToolCalls();
    // ... existing tool execution code ...
  }
}
```

### 1.4 Tests for Turn

**File**: `packages/cli/src/runtime/turn.test.ts`

- Test basic text response
- Test tool call emission
- Test error handling
- Test abort signal
- Test token usage tracking

---

## Phase 2: Streaming Support

**Goal**: Replace `generateText` with `streamText` for real-time response display.

### 2.1 Add Streaming Events to UIEventBus

**File**: `packages/core/src/ui-events.ts`

```typescript
export interface DisplayEvents {
  // ... existing events ...

  /** Streaming text chunk from LLM */
  textDelta: { text: string };

  /** Streaming complete */
  textDone: { fullText: string };
}
```

### 2.2 Update RuntimeUI Interface

**File**: `packages/core/src/runtime-ui.ts`

```typescript
export interface RuntimeUI {
  // ... existing methods ...

  /** Stream a text chunk to the UI */
  streamTextDelta(text: string): void;

  /** Signal streaming is complete */
  streamTextDone(fullText: string): void;
}
```

### 2.3 Implement Streaming in Turn

```typescript
async *run(): AsyncGenerator<TurnEvent> {
  this.state = 'streaming';

  try {
    // Use streamText instead of generateText
    const stream = streamText({
      model: this.config.model,
      messages: this.config.messages,
      tools: this.config.tools,
      abortSignal: this.config.signal,
    });

    // Stream text chunks
    for await (const chunk of stream.textStream) {
      this.accumulatedText += chunk;
      yield { type: 'text_delta', text: chunk };
    }

    // Get final result
    const result = await stream.response;

    yield { type: 'text_done', text: this.accumulatedText };

    // Emit tool calls (if any)
    if (result.toolCalls?.length) {
      this.state = 'tool_execution';
      for (const tc of result.toolCalls) {
        yield { type: 'tool_call', ... };
      }
      this.toolCalls = result.toolCalls;
    }

    yield { type: 'finished', ... };
    this.state = 'complete';
  } catch (err) {
    // ... error handling ...
  }
}
```

### 2.4 Update UI Components for Streaming

**File**: `packages/cli/src/ui/ink/components/messages/AssistantMessage.tsx`

```typescript
interface AssistantMessageProps {
  content: string;
  isStreaming?: boolean;
}

export function AssistantMessage({ content, isStreaming }: AssistantMessageProps) {
  const theme = useTheme();

  return (
    <Box flexDirection="column">
      <Text color={theme.colors.text.primary}>
        {content}
        {isStreaming && <Text color={theme.colors.text.muted}>▌</Text>}
      </Text>
    </Box>
  );
}
```

### 2.5 Update MessagesContext for Streaming

**File**: `packages/ui-react/src/contexts/MessagesContext.tsx`

```typescript
interface StreamingState {
  isStreaming: boolean;
  currentText: string;
}

// Add streaming state management
function messagesReducer(state, action) {
  switch (action.type) {
    case 'TEXT_DELTA':
      return {
        ...state,
        streaming: {
          isStreaming: true,
          currentText: state.streaming.currentText + action.text,
        },
      };
    case 'TEXT_DONE':
      return {
        ...state,
        streaming: { isStreaming: false, currentText: '' },
        messages: [...state.messages, { role: 'assistant', content: action.fullText }],
      };
    // ...
  }
}
```

### 2.6 Configuration Option

Add option to disable streaming (for testing, non-TTY, etc.):

```typescript
interface WorkerRuntimeOptions {
  // ... existing options ...

  /** Disable streaming (use generateText instead of streamText) */
  disableStreaming?: boolean;
}
```

---

## Phase 3: Tool Queue

**Goal**: Add optional sequential tool execution for tools that shouldn't run in parallel.

### 3.1 Tool Queue Types

**File**: `packages/cli/src/runtime/tool-queue.ts`

```typescript
export type ToolQueueMode = 'parallel' | 'sequential';

export interface QueuedToolCall {
  toolCallId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  priority?: number;  // Lower = higher priority
}

export type ToolQueueState =
  | 'idle'
  | 'validating'
  | 'awaiting_approval'
  | 'executing'
  | 'complete'
  | 'error'
  | 'cancelled';

export interface TrackedToolCall extends QueuedToolCall {
  state: ToolQueueState;
  result?: unknown;
  error?: Error;
  startTime?: number;
  endTime?: number;
}
```

### 3.2 Implement ToolQueue

```typescript
/**
 * Manages sequential tool execution.
 *
 * Tools are processed one at a time from a priority queue.
 * This is useful when tools have dependencies or shared resources.
 */
export class ToolQueue {
  private queue: TrackedToolCall[] = [];
  private current: TrackedToolCall | null = null;
  private toolExecutor: ToolExecutor;
  private onUpdate?: (calls: TrackedToolCall[]) => void;

  constructor(options: {
    toolExecutor: ToolExecutor;
    onUpdate?: (calls: TrackedToolCall[]) => void;
  }) {
    this.toolExecutor = options.toolExecutor;
    this.onUpdate = options.onUpdate;
  }

  /**
   * Add tool calls to the queue.
   */
  enqueue(calls: QueuedToolCall[]): void {
    const tracked = calls.map(c => ({
      ...c,
      state: 'idle' as ToolQueueState,
    }));

    this.queue.push(...tracked);

    // Sort by priority
    this.queue.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));

    this.notifyUpdate();
  }

  /**
   * Process all queued tools sequentially.
   */
  async *process(): AsyncGenerator<ToolResult> {
    while (this.queue.length > 0) {
      const call = this.queue.shift()!;
      this.current = call;

      call.state = 'validating';
      this.notifyUpdate();

      // Execute via ToolExecutor (handles approval)
      call.state = 'executing';
      call.startTime = Date.now();
      this.notifyUpdate();

      try {
        const [result] = await this.toolExecutor.executeBatch([{
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          toolArgs: call.toolArgs,
        }], { messages: [], iteration: 0 });

        call.state = 'complete';
        call.result = result.output;
        call.endTime = Date.now();

        yield result;
      } catch (err) {
        call.state = 'error';
        call.error = err instanceof Error ? err : new Error(String(err));
        call.endTime = Date.now();

        yield {
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          output: call.error.message,
          isError: true,
        };
      }

      this.current = null;
      this.notifyUpdate();
    }
  }

  /**
   * Cancel remaining queued tools.
   */
  cancel(): void {
    for (const call of this.queue) {
      call.state = 'cancelled';
    }
    this.queue = [];
    this.notifyUpdate();
  }

  private notifyUpdate(): void {
    const all = this.current
      ? [this.current, ...this.queue]
      : [...this.queue];
    this.onUpdate?.(all);
  }
}
```

### 3.3 Add Queue Mode to Worker Config

**File**: `packages/cli/src/worker/schema.ts`

```yaml
# Worker YAML schema addition
toolsets:
  filesystem:
    queue_mode: sequential  # or 'parallel' (default)
```

```typescript
// Schema update
export const ToolsetConfigSchema = z.object({
  queue_mode: z.enum(['parallel', 'sequential']).optional().default('parallel'),
  // ... other config ...
});
```

### 3.4 Integrate Queue into WorkerRuntime

```typescript
// In WorkerRuntime.run()
if (toolCalls.length > 0) {
  const queueMode = this.getQueueMode();

  if (queueMode === 'sequential') {
    // Use ToolQueue
    const queue = new ToolQueue({
      toolExecutor: this.toolExecutor!,
      onUpdate: (calls) => this.emitToolQueueUpdate(calls),
    });

    queue.enqueue(toolCalls.map(tc => ({
      toolCallId: tc.toolCallId,
      toolName: tc.toolName,
      toolArgs: getToolArgs(tc),
    })));

    const results: ToolResult[] = [];
    for await (const result of queue.process()) {
      results.push(result);
    }

    // Add results to messages
    // ...
  } else {
    // Existing parallel batch execution
    const results = await this.toolExecutor!.executeBatch(executorCalls, context);
    // ...
  }
}
```

### 3.5 UI Updates for Queue

Add queue visualization to show:
- Current executing tool
- Queued tools (with position)
- Completed tools

```typescript
// New event type
export interface DisplayEvents {
  toolQueueUpdate: {
    current: TrackedToolCall | null;
    queued: TrackedToolCall[];
    completed: TrackedToolCall[];
  };
}
```

---

## Implementation Order

### Step 1: Turn Abstraction (Foundation)
1. Create `turn.ts` with types and non-streaming Turn class
2. Add tests for Turn
3. Refactor WorkerRuntime to use Turn internally
4. Verify all existing tests pass

### Step 2: Streaming Support
1. Add streaming events to core
2. Update RuntimeUI interface
3. Implement streaming in Turn class
4. Update UI components for streaming display
5. Add `disableStreaming` option
6. Update tests

### Step 3: Tool Queue (Optional)
1. Create `tool-queue.ts` with ToolQueue class
2. Add queue mode to worker schema
3. Integrate into WorkerRuntime
4. Add UI events for queue state
5. Update components for queue visualization

---

## Testing Strategy

### Unit Tests
- Turn: text response, tool calls, errors, abort
- ToolQueue: enqueue, process, cancel, priority ordering

### Integration Tests
- Full conversation with streaming
- Tool execution with queue mode
- Interruption handling

### Manual Testing
- Visual verification of streaming in terminal
- Queue state display during multi-tool execution

---

## Backwards Compatibility

All changes are additive:
- Turn is used internally, API unchanged
- Streaming is opt-out via `disableStreaming: true`
- Queue mode defaults to `'parallel'` (current behavior)

Existing workers and tests will continue to work without modification.

---

## Files to Create/Modify

### New Files
- `packages/cli/src/runtime/turn.ts`
- `packages/cli/src/runtime/turn.test.ts`
- `packages/cli/src/runtime/tool-queue.ts`
- `packages/cli/src/runtime/tool-queue.test.ts`

### Modified Files
- `packages/core/src/ui-events.ts` - Add streaming events
- `packages/core/src/runtime-ui.ts` - Add streaming methods
- `packages/cli/src/runtime/worker.ts` - Use Turn, integrate queue
- `packages/cli/src/runtime/interfaces.ts` - Add streaming option
- `packages/cli/src/worker/schema.ts` - Add queue_mode
- `packages/ui-react/src/contexts/MessagesContext.tsx` - Streaming state
- `packages/cli/src/ui/ink/components/messages/AssistantMessage.tsx` - Streaming cursor
