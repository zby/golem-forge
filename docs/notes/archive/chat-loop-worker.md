# Chat Loop Worker Support

## Status: Infrastructure Exists, Pattern Missing

Date: 2025-12-09

## Current State

The infrastructure for user input exists:
- `RuntimeUI.getUserInput(prompt)` at `packages/core/src/runtime-ui.ts`
- `inputPrompt` / `userInput` events in the UI event system
- InkAdapter handles input prompts via `InputPrompt` component

**Gap:** No chat loop pattern is implemented. Workers use a **single-shot model** - `run()` completes when the LLM stops making tool calls.

## Can It Be Implemented Now?

Yes, with manual wiring. The simplest approach is to loop externally:

```typescript
// Pseudocode for chat loop
const runtime = new DefaultRuntime({ workers: [chatWorker] });
await runtime.initialize();

const messages: Message[] = [];

while (true) {
  const userInput = await runtimeUI.getUserInput('You: ');
  if (userInput === 'exit') break;

  messages.push({ role: 'user', content: userInput });

  const result = await runtime.run({
    workerName: 'chat',
    input: userInput,
    messages  // Pass conversation history
  });

  messages.push({ role: 'assistant', content: result.response });
}
```

## What's Missing for First-Class Support

1. **Message history accumulation** in WorkerRunner (`packages/cli/src/runtime/worker.ts`)
2. **A `continue()` method** or similar on the worker interface
3. **A chat mode flag** in worker definitions

## Implementation Options

### Option A: Loop in CLI Runner (Simplest)
- Keep worker instance alive after `run()` completes
- Collect user input with `runtimeUI.getUserInput()`
- Call `run()` again with user input as new message
- Maintain message history externally

### Option B: Modify Worker Runtime (More integrated)
- Add a `continue(userInput: string)` method to WorkerRunner
- Accumulate message history internally
- Allow workers to call `runtimeUI.getUserInput()` mid-execution

### Option C: Add chat mode to Worker Definition
- Define workers with `chat: true` mode in worker schema
- Runtime detects this and implements continuous loop
- Worker instructions could hint at multi-turn expectations

## UI Architecture

The CLI now uses **InkAdapter** (React/Ink-based) as the default UI:

```
┌─────────────────────────────────────────────────────────────┐
│                     @golem-forge/core                        │
│   UIEventBus (pub/sub), RuntimeUI (convenience wrapper)      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   @golem-forge/ui-react                      │
│   State modules, React contexts, hooks, UIProvider           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      @golem-forge/cli                        │
│   InkAdapter (default)  |  HeadlessAdapter (--headless)      │
└─────────────────────────────────────────────────────────────┘
```

## Key Files

- Worker interface: `packages/cli/src/runtime/interfaces.ts`
- Message building: `packages/cli/src/runtime/worker.ts`
- User input collection: `packages/core/src/runtime-ui.ts`
- InkAdapter: `packages/cli/src/ui/ink/InkAdapter.tsx`
- Input handling: `packages/cli/src/ui/ink/components/layout/InputPrompt.tsx`
- CLI run entry point: `packages/cli/src/cli/run.ts`
