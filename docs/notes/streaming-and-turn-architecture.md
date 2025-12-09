# Plan: Streaming, Turn Abstraction, and Tool Queue

> **Status:** Partially implemented (Dec 2025)
>
> **What's done:**
> - Streaming infrastructure in core (`StreamingEvent`, `RuntimeUI.startStreaming/appendStreaming/endStreaming`)
> - Runtime consolidated in `@golem-forge/core` (not CLI-specific anymore)
> - `ToolExecutor` handles approval gates
>
> **What's pending:**
> - Turn abstraction (clean encapsulation of conversation turns)
> - Tool Queue (sequential tool execution option)
> - Full streaming in `WorkerRuntime.run()` (currently uses `generateText`, not `streamText`)

## Overview

This plan covers three related improvements to the chat loop architecture:

1. **StreamText Support** - Real-time response streaming ✅ Infrastructure ready, runtime integration pending
2. **Turn Abstraction** - Clean encapsulation of conversation turns ⏳ Not started
3. **Tool Queue** - Sequential tool execution option ⏳ Not started

---

## Current Implementation (Dec 2025)

### Runtime Location

The runtime is now in `@golem-forge/core`, not CLI:

```
packages/core/src/
├── runtime/
│   ├── worker.ts         # WorkerRuntime class
│   ├── tool-executor.ts  # ToolExecutor with approval
│   ├── events.ts         # RuntimeEvent types
│   ├── types.ts          # WorkerResult, RunInput, etc.
│   └── model-factory.ts  # Model creation utilities
```

### Streaming Infrastructure (Already Exists)

**File**: `packages/core/src/ui-events.ts`

```typescript
/**
 * Streaming text update (token-by-token output)
 */
export interface StreamingEvent {
  /** Request ID for correlation with commit */
  requestId: string;
  /** Delta content (append to existing) */
  delta: string;
  /** Whether this is the final chunk */
  done: boolean;
}
```

**File**: `packages/core/src/runtime-ui.ts`

```typescript
export interface RuntimeUI {
  /** Start streaming response */
  startStreaming(requestId: string): void;

  /** Append to streaming response */
  appendStreaming(requestId: string, delta: string): void;

  /** End streaming response */
  endStreaming(requestId: string, fullText: string): void;
}
```

### Current WorkerRuntime (Uses generateText)

The current `WorkerRuntime.run()` method uses `generateText` (blocking) instead of `streamText` (streaming):

```typescript
// packages/core/src/runtime/worker.ts
async run(input: RunInput): Promise<WorkerResult> {
  // ...
  const result = await generateText({
    model,
    messages,
    tools: hasTools ? getLLMTools(this.tools) : undefined,
    abortSignal: this.options.interruptSignal?.signal,
  });
  // ...
}
```

To enable real streaming, the runtime needs to switch to `streamText` and emit streaming events.

---

## Phase 1: Turn Abstraction (Pending)

**Goal**: Create a `Turn` class that encapsulates a single conversation turn, making the code more testable and preparing for full streaming.

### 1.1 Create Turn Types

**File**: `packages/core/src/runtime/turn.ts`

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
  signal?: AbortSignal;
  useStreaming?: boolean;
}
```

### 1.2 Implement Turn Class

```typescript
/**
 * Represents a single conversation turn.
 *
 * A turn is: user message → LLM response → (optional tool calls)
 * Tool execution happens outside the turn (in WorkerRuntime loop).
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
   */
  async *run(): AsyncGenerator<TurnEvent> {
    this.state = 'streaming';

    try {
      if (this.config.useStreaming) {
        yield* this.runStreaming();
      } else {
        yield* this.runBlocking();
      }
    } catch (err) {
      this.state = 'error';
      yield { type: 'error', error: err instanceof Error ? err : new Error(String(err)) };
    }
  }

  private async *runBlocking(): AsyncGenerator<TurnEvent> {
    const result = await generateText({
      model: this.config.model,
      messages: this.config.messages,
      tools: this.config.tools,
      abortSignal: this.config.signal,
    });

    if (result.text) {
      this.accumulatedText = result.text;
      yield { type: 'text_done', text: result.text };
    }

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
  }

  private async *runStreaming(): AsyncGenerator<TurnEvent> {
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

    yield { type: 'text_done', text: this.accumulatedText };

    // Get final result for tool calls and usage
    const result = await stream.response;

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
  }

  getState(): TurnState { return this.state; }
  getText(): string { return this.accumulatedText; }
  getToolCalls(): ToolCall[] { return this.toolCalls; }
}
```

### 1.3 Refactor WorkerRuntime to Use Turn

**Changes to** `packages/core/src/runtime/worker.ts`:

```typescript
async run(input: RunInput): Promise<WorkerResult> {
  // ... setup code ...

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const requestId = `turn-${iteration}`;

    // Create turn
    const turn = new Turn({
      model: this.model,
      messages,
      tools: hasTools ? getLLMTools(this.tools) : undefined,
      signal: this.options.interruptSignal?.signal,
      useStreaming: !this.options.disableStreaming,
    });

    // Start streaming UI
    this.runtimeUI?.startStreaming(requestId);

    // Process turn events
    let hasToolCalls = false;
    for await (const event of turn.run()) {
      switch (event.type) {
        case 'text_delta':
          this.runtimeUI?.appendStreaming(requestId, event.text);
          break;

        case 'text_done':
          this.runtimeUI?.endStreaming(requestId, event.text);
          break;

        case 'tool_call':
          hasToolCalls = true;
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
    // ... existing tool execution code via ToolExecutor ...
  }
}
```

---

## Phase 2: Enable Full Streaming (Pending)

Once Turn abstraction is in place, streaming will work automatically. Additional tasks:

### 2.1 Add Streaming Option to Worker Config

```typescript
interface WorkerRuntimeOptionsWithTools {
  // ... existing options ...

  /** Disable streaming (use generateText instead of streamText) */
  disableStreaming?: boolean;
}
```

### 2.2 Update UI-React State for Streaming

The `@golem-forge/ui-react` package already has streaming state management.
Verify it handles the `StreamingEvent` properly.

---

## Phase 3: Tool Queue (Pending)

**Goal**: Add optional sequential tool execution for tools that shouldn't run in parallel.

This phase is unchanged from the original plan - see original document for details.

Key types:

```typescript
export type ToolQueueMode = 'parallel' | 'sequential';

export interface QueuedToolCall {
  toolCallId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  priority?: number;
}
```

---

## Implementation Order

### Step 1: Turn Abstraction
1. Create `packages/core/src/runtime/turn.ts`
2. Add tests in `packages/core/src/runtime/turn.test.ts`
3. Refactor `WorkerRuntime` to use Turn internally
4. Verify all existing tests pass

### Step 2: Enable Full Streaming
1. Add `disableStreaming` option
2. Wire up Turn's streaming to RuntimeUI events
3. Test with CLI Ink UI
4. Test with Chrome extension UI

### Step 3: Tool Queue (Optional)
1. Create `packages/core/src/runtime/tool-queue.ts`
2. Add queue mode to worker schema
3. Integrate into WorkerRuntime
4. Add UI events for queue state

---

## Files to Create/Modify

### New Files
- `packages/core/src/runtime/turn.ts`
- `packages/core/src/runtime/turn.test.ts`
- `packages/core/src/runtime/tool-queue.ts` (Phase 3)
- `packages/core/src/runtime/tool-queue.test.ts` (Phase 3)

### Modified Files
- `packages/core/src/runtime/worker.ts` - Use Turn class
- `packages/core/src/runtime/types.ts` - Add `disableStreaming` option
- `packages/core/src/worker-schema.ts` - Add `queue_mode` (Phase 3)

---

## Backwards Compatibility

All changes are additive:
- Turn is used internally, API unchanged
- Streaming is opt-out via `disableStreaming: true`
- Queue mode defaults to `'parallel'` (current behavior)

Existing workers and tests will continue to work without modification.
