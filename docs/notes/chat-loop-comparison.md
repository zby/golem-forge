# Chat Loop Architecture Comparison: Gemini CLI vs Golem Forge

> **Last updated:** Dec 2025
> **Purpose:** Reference comparison for understanding architectural trade-offs

## Overview

Both systems implement an agentic loop (user → LLM → tools → LLM → ...), but with different architectural approaches.

| Aspect | Gemini CLI | Golem Forge |
|--------|-----------|-------------|
| **Runtime Location** | `packages/core` | `packages/core/src/runtime` |
| **Loop Controller** | `Turn` + `GeminiChat` + `useGeminiStream` | `WorkerRuntime.run()` |
| **Tool Scheduling** | `CoreToolScheduler` (queue-based) | `ToolExecutor` (batch execution) |
| **Streaming** | Async generator yielding events | Infrastructure ready, uses `generateText` |
| **UI Integration** | React hooks + contexts | Event bus + RuntimeUI |

---

## Gemini CLI Architecture

### Layer Separation

```
┌─────────────────────────────────────────────────────────┐
│  UI Layer (packages/cli/src/ui)                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  useGeminiStream (React hook)                   │    │
│  │  - Handles user input validation                │    │
│  │  - Processes slash/@ commands                   │    │
│  │  - Coordinates streaming + tool scheduling      │    │
│  │  - Manages cancellation                         │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                              │
│  ┌─────────────────────────────────────────────────┐    │
│  │  useReactToolScheduler (React hook)             │    │
│  │  - Bridges CoreToolScheduler to React state     │    │
│  │  - Maps tool calls to display objects           │    │
│  │  - Handles live output updates                  │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│  Core Layer (packages/core/src/core)                    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  GeminiChat                                      │    │
│  │  - Maintains conversation history                │    │
│  │  - sendMessageStream() → async generator         │    │
│  │  - Handles retries + validation                  │    │
│  │  - Curated vs comprehensive history              │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                              │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Turn                                            │    │
│  │  - Single conversation turn                      │    │
│  │  - run() yields StreamEvent objects              │    │
│  │  - Content chunks, tool requests, citations      │    │
│  │  - Tracks finishReason                           │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                              │
│  ┌─────────────────────────────────────────────────┐    │
│  │  CoreToolScheduler                               │    │
│  │  - Sequential queue processing                   │    │
│  │  - State machine: validating → scheduled →       │    │
│  │    executing → success/error/cancelled           │    │
│  │  - Policy-based approval                         │    │
│  │  - Live output streaming                         │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                              │
│  ┌─────────────────────────────────────────────────┐    │
│  │  ContentGenerator (interface)                    │    │
│  │  - generateContentStream() → async generator     │    │
│  │  - Decorated: Logging, Recording, Fake           │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Streaming-First**: Everything is async generators. The `Turn.run()` method yields events:
   ```typescript
   async *run(): AsyncGenerator<TurnEvent> {
     for await (const chunk of stream) {
       yield { type: 'content', text: chunk.text };
       if (chunk.functionCall) {
         yield { type: 'tool_request', call: chunk.functionCall };
       }
     }
     yield { type: 'finished', reason: finishReason };
   }
   ```

2. **Sequential Tool Execution**: Tools execute one at a time from a queue:
   ```
   requestQueue: [tool1, tool2, tool3]
                    ↓
   Processing: tool1 (validating → scheduled → executing → done)
                    ↓
   Processing: tool2 ...
   ```

3. **Curated History**: Invalid turns are filtered before sending to API:
   ```typescript
   // Only valid turns go to API
   const curatedHistory = extractCuratedHistory(allHistory);
   ```

4. **React State Bridge**: `useReactToolScheduler` maps scheduler state to React:
   ```typescript
   const [toolCallsForDisplay, setToolCallsForDisplay] = useState<TrackedToolCall[]>([]);

   // On scheduler update
   setToolCallsForDisplay(prev =>
     coreToolCalls.map(tc => ({
       ...tc,
       // Preserve React-specific state
       responseSubmittedToGemini: prev.find(p => p.id === tc.id)?.responseSubmittedToGemini
     }))
   );
   ```

---

## Golem Forge Architecture

### Layer Separation

```
┌─────────────────────────────────────────────────────────┐
│  UI Layer (packages/cli/src/ui/ink)                     │
│  ┌─────────────────────────────────────────────────┐    │
│  │  InkAdapter                                      │    │
│  │  - Connects RuntimeUI to UIEventBus             │    │
│  │  - Renders Ink app with providers               │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                              │
│  ┌─────────────────────────────────────────────────┐    │
│  │  UIProvider (from @golem-forge/ui-react)         │    │
│  │  - 6 nested context providers                    │    │
│  │  - Subscribes to bus events                      │    │
│  │  - Updates React state from events              │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
                          │
                    UIEventBus
                    (pub/sub)
                          │
┌─────────────────────────────────────────────────────────┐
│  Core Layer (packages/core/src/runtime)                 │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  WorkerRuntime                                   │    │
│  │  - run() method = main loop                      │    │
│  │  - Supports single + chat modes                  │    │
│  │  - generateText() (streaming infra ready)        │    │
│  │  - Emits events via RuntimeUI                    │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                              │
│  ┌─────────────────────────────────────────────────┐    │
│  │  ToolExecutor                                    │    │
│  │  - executeBatch() = parallel tool execution      │    │
│  │  - Approval checking per tool                    │    │
│  │  - Event emission for UI                         │    │
│  └─────────────────────────────────────────────────┘    │
│                          │                              │
│  ┌─────────────────────────────────────────────────┐    │
│  │  ApprovalController                              │    │
│  │  - Mode-based: interactive/approve_all/auto_deny │    │
│  │  - Session memory for caching                    │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Iteration-Based Loop**: Simple for-loop with max iterations, handles both single and chat modes:
   ```typescript
   // Outer chat loop (runs once for single mode, repeatedly for chat)
   chatLoop: while (true) {
     // Inner tool loop
     for (let iteration = 0; iteration < maxIterations; iteration++) {
       const result = await generateText({ model, messages, tools });

       if (!result.toolCalls?.length) {
         // No tools - turn complete
         if (!isChatMode) return { success: true, response: result.text };
         // Chat mode: get next user input and continue chatLoop
         break;
       }

       // Execute tools and add results to messages
       const results = await toolExecutor.executeBatch(toolCalls);
       messages.push({ role: 'tool', content: results });
     }
   }
   ```

2. **Batch Tool Execution**: All tools from one turn execute together:
   ```typescript
   // ToolExecutor.executeBatch()
   const results = await Promise.all(
     toolCalls.map(tc => this.executeSingle(tc))
   );
   ```

3. **Event Bus Decoupling**: Runtime and UI communicate via typed events:
   ```typescript
   // Runtime emits
   runtimeUI.showToolStarted(toolCallId, toolName, args);

   // UI subscribes (via context provider)
   bus.on('toolStarted', (data) => {
     setToolCalls(prev => [...prev, data]);
   });
   ```

4. **Streaming Infrastructure Ready**: Uses `generateText()` but streaming events exist:
   ```typescript
   // Infrastructure exists in RuntimeUI:
   runtimeUI.startStreaming(requestId);
   runtimeUI.appendStreaming(requestId, delta);
   runtimeUI.endStreaming(requestId, fullText);

   // To enable streaming, replace generateText with streamText inline
   ```

---

## Detailed Comparison

### 1. Streaming vs Non-Streaming

**Gemini CLI** (streaming):
```typescript
// UI sees incremental updates
for await (const event of turn.run()) {
  switch (event.type) {
    case 'content':
      appendToDisplay(event.text);  // Immediate feedback
      break;
    case 'tool_request':
      showToolPending(event.call);
      break;
  }
}
```

**Golem Forge** (non-streaming, but infrastructure ready):
```typescript
// Current: waits for full response
const result = await generateText({ model, messages, tools });

// To enable streaming (~10 line change):
const stream = streamText({ model, messages, tools });
runtimeUI.startStreaming(requestId);
for await (const chunk of stream.textStream) {
  runtimeUI.appendStreaming(requestId, chunk);
}
const result = await stream;
runtimeUI.endStreaming(requestId, result.text);
```

**Impact**: Streaming provides better UX for long responses. Our infrastructure is ready; it's a simple inline change when needed.

### 2. Tool Scheduling Strategy

**Gemini CLI** (sequential queue):
```
Pros:
- Predictable execution order
- Easy to cancel mid-queue
- Memory efficient (one tool at a time)

Cons:
- Slower for independent tools
- Complex state machine
```

**Golem Forge** (parallel batch):
```
Pros:
- Faster for independent tools
- Simpler implementation

Cons:
- All-or-nothing cancellation
- Higher memory for parallel execution
```

**Our choice**: Parallel batch is simpler and faster for most cases. Sequential execution can be added as an option if needed.

### 3. History Management

**Gemini CLI**:
- Maintains "curated" history (valid turns only)
- Maintains "comprehensive" history (all attempts)
- Filters invalid responses before API calls
- Supports checkpointing/resuming

**Golem Forge**:
- Simple message array
- No invalid turn filtering (errors go back to LLM)
- No session persistence yet

### 4. UI Integration

**Gemini CLI**:
```typescript
// Direct React state management in hooks
const [toolCalls, setToolCalls] = useState([]);

scheduler.onUpdate((calls) => {
  setToolCalls(mapToDisplay(calls));
});
```

**Golem Forge**:
```typescript
// Event bus indirection (platform-agnostic)
runtimeUI.showToolStarted(id, name, args);

// In provider
bus.on('toolStarted', (data) => {
  dispatch({ type: 'TOOL_START', payload: data });
});
```

**Our choice**: Event bus allows the same runtime to work with CLI (Ink) and browser (Chrome extension) UIs.

---

## What We've Adopted / Decided

### Adopted

1. **Event-Driven UI** ✅
   - `UIEventBus` for runtime ↔ UI communication
   - `RuntimeUI` wrapper for convenient event emission
   - Works across CLI and browser platforms

2. **Streaming Infrastructure** ✅
   - `StreamingEvent` type with `requestId`, `delta`, `done`
   - `RuntimeUI.startStreaming/appendStreaming/endStreaming` methods
   - Ready to switch from `generateText` to `streamText` when needed

3. **Chat Mode** ✅
   - `WorkerRuntime.run()` handles both single and chat modes
   - `/exit` and `/new` commands for chat control
   - Context usage tracking with `max_context_tokens`

### Decided Against

1. **Turn Abstraction** ❌
   - Analyzed in `streaming-and-turn-architecture.md` (archived)
   - Over-engineering for our needs
   - Switching to `streamText` is a ~10 line inline change
   - The complexity is in loop logic, not individual LLM calls

2. **Separate ChatSession Class** ❌
   - `WorkerRuntime` already handles chat mode cleanly
   - Adding another layer would duplicate logic

### Could Consider Later

1. **Sequential Tool Queue**
   - For tools that shouldn't run in parallel (e.g., file operations on same file)
   - Add as configuration option, not default

2. **History Curation**
   - Filter invalid responses before sending to API
   - Useful for long sessions with many errors

3. **Live Output Streaming**
   - For shell commands, show output incrementally
   - Would require shell tool changes

4. **Session Persistence**
   - Save/restore conversation state
   - Useful for long sessions, not high priority

---

## Key Takeaways

1. **Gemini CLI is more complex** - Turn abstraction, curated history, sequential queue, decorator pattern. Good for a general-purpose CLI with many edge cases.

2. **Golem Forge is simpler by design** - Worker-based model with clear boundaries. Complexity is in toolsets and approval, not the loop.

3. **Our event bus is a good choice** - Platform-agnostic communication allows same runtime for CLI and browser.

4. **Streaming is ready when needed** - Infrastructure exists, just need to swap `generateText` for `streamText`.
