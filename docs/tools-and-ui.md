# Tools and UI

This document covers how tools are defined, executed, and presented to users in Golem Forge.

## Overview

Tools in Golem Forge have two key properties that control how they can be used:

| Property | Question | Values |
|----------|----------|--------|
| **Execution Mode** | Who can invoke? | `llm`, `manual`, `both` |
| **Approval** | Requires confirmation? | `true`, `false`, or function |

These are orthogonal: a manual tool can still require approval, and an LLM tool can be pre-approved.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Tool Definition                           │
│                                                                  │
│  ┌──────────────────────┐    ┌──────────────────────┐           │
│  │  Execution Mode      │    │  Approval            │           │
│  │                      │    │                      │           │
│  │  llm     → LLM only  │    │  false → execute     │           │
│  │  manual  → user only │    │  true  → ask first   │           │
│  │  both    → either    │    │  fn    → dynamic     │           │
│  └──────────────────────┘    └──────────────────────┘           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tool Definition

Tools extend the AI SDK's `Tool` type with additional properties:

```typescript
interface NamedTool extends Tool {
  name: string;
  description: string;
  inputSchema: ZodType;
  execute: (args, options) => Promise<unknown>;

  // Approval: requires confirmation before execution?
  needsApproval?: boolean | ((args, options) => boolean | Promise<boolean>);

  // Execution mode: who can invoke this tool?
  manualExecution?: {
    mode: 'llm' | 'manual' | 'both';
    label?: string;      // Human-readable name
    category?: string;   // Grouping in UI
  };
}
```

### Example: Git Push Tool

```typescript
export const gitPushTool: NamedTool = {
  name: 'git_push',
  description: 'Push commits to remote repository',

  inputSchema: z.object({
    remote: z.enum(['origin', 'upstream']).default('origin'),
    branch: z.string().describe('Target branch'),
    force: z.boolean().default(false).describe('Force push'),
  }),

  execute: async ({ remote, branch, force }) => {
    const args = force ? ['push', '-f', remote, branch] : ['push', remote, branch];
    return execGit(args);
  },

  // Approval: force push requires confirmation
  needsApproval: ({ force }) => force,

  // Execution: user-only (LLM cannot push)
  manualExecution: {
    mode: 'manual',
    label: 'Push to Remote',
    category: 'Git',
  },
};
```

---

## Approval System

### The needsApproval Pattern

Tools declare approval requirements directly:

```typescript
// Static: always needs approval
createWriteFileTool(sandbox)     // needsApproval: true

// Static: never needs approval
createReadFileTool(sandbox)      // needsApproval: false

// Dynamic: depends on arguments
createDeleteFileTool(sandbox, {
  needsApproval: ({ path }) => path.startsWith('/important/'),
})
```

### Approval Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        WorkerRuntime                             │
│                                                                  │
│  1. LLM returns tool calls                                       │
│  2. For each tool call:                                          │
│     ┌──────────────────────────────────────────────────────┐    │
│     │  tool.needsApproval?                                  │    │
│     │    ├─ false → execute immediately                     │    │
│     │    └─ true  → ApprovalController.requestApproval()    │    │
│     │               ├─ approved → execute                   │    │
│     │               └─ denied → return error result         │    │
│     └──────────────────────────────────────────────────────┘    │
│  3. Feed results back to LLM                                     │
└─────────────────────────────────────────────────────────────────┘
```

### ApprovalController

The controller handles approval decisions:

```typescript
const controller = new ApprovalController({
  mode: 'interactive',  // or 'approve_all', 'auto_deny'
  approvalCallback: async (request) => {
    // Show UI, get user decision
    return { approved: true, remember: 'session' };
  },
});
```

**Modes:**
- `interactive` - Call the callback for user decision
- `approve_all` - Auto-approve everything (testing, trusted contexts)
- `auto_deny` - Deny everything that needs approval

### Zone-Aware Approval

For filesystem tools, approval can be configured per-zone:

```yaml
# In worker file
sandbox:
  zones:
    - name: scratch
      mode: rw
      approval:
        write: preApproved    # No prompt for /scratch/*
        delete: preApproved
    - name: output
      mode: rw
      approval:
        write: ask            # Prompt for /output/*
        delete: blocked       # Block deletes entirely
```

This creates a dynamic `needsApproval` function:

```typescript
const toolset = new FilesystemToolset({
  sandbox,
  zoneApprovalConfig: {
    scratch: { write: 'preApproved', delete: 'preApproved' },
    output: { write: 'ask', delete: 'blocked' },
  },
});

// write_file({ path: '/scratch/temp.txt' }) → no approval
// write_file({ path: '/output/report.md' }) → prompts user
```

**Approval decisions:**
- `preApproved` - No user prompt needed
- `ask` - Prompt user (default)
- `blocked` - Operation blocked entirely

### Session Memory

If user selects "remember for session", subsequent identical calls skip the prompt:

```typescript
// User approves write_file with {path: "/workspace/foo.txt"}
// Future identical calls are auto-approved
```

### BlockedError

For operations that should never be allowed:

```typescript
if (config.blocked) {
  throw new BlockedError(toolName, config.blockReason || 'Blocked by policy');
}
```

---

## Execution Modes

### LLM Mode (default)

Tool is only available to the LLM. This is the default when `manualExecution` is not set.

```typescript
const readFileTool: NamedTool = {
  name: 'read_file',
  // No manualExecution → LLM only
};
```

### Manual Mode

Tool is only available to the user via slash commands:

```typescript
const deployTool: NamedTool = {
  name: 'deploy',
  manualExecution: {
    mode: 'manual',
    label: 'Deploy Application',
    category: 'Operations',
  },
};
```

### Both Mode

Tool available to both LLM and user:

```typescript
const runTestsTool: NamedTool = {
  name: 'run_tests',
  manualExecution: {
    mode: 'both',
    label: 'Run Tests',
    category: 'Development',
  },
};
```

### Tool Filtering

Filter tools by execution mode:

```typescript
import { getLLMTools, getManualTools, isManualTool } from '@anthropic/golem-forge';

const allTools = runtime.getTools();

// Tools for LLM (mode: 'llm' or 'both' or no config)
const llmTools = getLLMTools(allTools);

// Tools for user (mode: 'manual' or 'both')
const manualTools = getManualTools(allTools);
```

---

## User Interface

Golem Forge uses an **event-driven UI architecture** that cleanly separates the runtime from UI rendering. This design allows the same runtime to work with different UI implementations (CLI, browser, etc.).

### Event-Driven Architecture

The architecture has three layers:

```
┌─────────────────────────────────────────────────────────────────┐
│                         Runtime                                  │
│  Uses RuntimeUI to emit display events and await responses      │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                        ┌───────▼───────┐
                        │  UIEventBus   │
                        │  (core)       │
                        └───────┬───────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│                     UI Implementation                            │
│  Subscribes to display events, emits action events              │
│  (EventCLIAdapter for terminal, React app for browser)          │
└─────────────────────────────────────────────────────────────────┘
```

### UIEventBus

The core event bus that both runtime and UI subscribe to:

```typescript
import { createUIEventBus, type UIEventBus } from '@golem-forge/core';

const bus = createUIEventBus();

// Display events (runtime → UI)
bus.emit('message', { message: { role: 'assistant', content: 'Hello!' } });
bus.emit('toolStarted', { toolCallId: 't1', toolName: 'read_file', args: { path: '/src' } });
bus.emit('toolResult', { toolCallId: 't1', toolName: 'read_file', status: 'success', ... });
bus.emit('streaming', { requestId: 'r1', delta: 'token', done: false });
bus.emit('approvalRequired', { requestId: 'a1', type: 'tool_call', ... });

// Action events (UI → runtime)
bus.emit('userInput', { requestId: 'i1', content: 'user message' });
bus.emit('approvalResponse', { requestId: 'a1', approved: true });
bus.emit('interrupt', { reason: 'User cancelled' });
bus.emit('manualToolInvoke', { toolName: 'deploy', args: {} });
```

### RuntimeUI

High-level convenience wrapper for runtime code:

```typescript
import { createRuntimeUI, type RuntimeUI } from '@golem-forge/core';

const ui = createRuntimeUI(bus);

// Fire-and-forget display methods
ui.showMessage({ role: 'assistant', content: 'Hello!' });
ui.showStatus({ type: 'info', message: 'Processing...' });
ui.showToolStarted('t1', 'read_file', { path: '/src' });

// Blocking methods (emit event, await response)
const approved = await ui.requestApproval({
  type: 'tool_call',
  description: 'Write file /output/result.txt',
  risk: 'medium',
});

const input = await ui.getUserInput('Enter your message:');
```

### EventCLIAdapter

Terminal implementation using the event bus:

```typescript
import { createEventCLIAdapter } from '@golem-forge/cli';

const adapter = createEventCLIAdapter(bus, {
  output: process.stdout,
  input: process.stdin,
  enableRawMode: true,
  traceLevel: 'normal', // 'quiet' | 'summary' | 'normal' | 'debug'
});

await adapter.initialize();
// Adapter now listens to bus events and renders to terminal
// User input is captured and emitted as action events

await adapter.shutdown();
```

### Slash Commands

Users invoke commands with `/` prefix:

**Built-in commands:**
```bash
/help                 # Show available commands
/model [name]         # Show or switch LLM model
/clear                # Clear conversation history
/status               # Show worker state
/tools                # List available manual tools
/exit                 # Exit session
```

**Manual tool commands:**
```bash
/tool git_push --branch main    # Invoke a manual tool
/tool git_push -i               # Interactive mode
/t git_push --branch main       # Short form
/git_push --branch main         # Direct (if tool exists)
```

### Command Parser

```typescript
import { parseCommand, classifyCommand, isCommand } from '@anthropic/golem-forge';

if (isCommand(input)) {
  const parsed = parseCommand(input);
  // { name: 'tool', args: ['git_push'], options: { branch: 'main' } }

  const classified = classifyCommand(parsed, availableTools);
  // { type: 'tool', toolName: 'git_push', parsed }
}
```

---

## Schema to Fields

Derive form fields from Zod schemas for manual tool UI:

```typescript
import { deriveFieldsFromSchema } from '@anthropic/golem-forge';

const schema = z.object({
  branch: z.string().describe('Target branch'),
  remote: z.enum(['origin', 'upstream']).default('origin'),
  force: z.boolean().default(false),
});

const fields = deriveFieldsFromSchema(schema);
// [
//   { name: 'branch', type: 'text', required: true },
//   { name: 'remote', type: 'select', options: [...], default: 'origin' },
//   { name: 'force', type: 'boolean', default: false },
// ]
```

**Supported Zod types:**

| Zod Type | Field Type |
|----------|------------|
| `z.string()` | `text` |
| `z.number()` | `number` |
| `z.boolean()` | `boolean` |
| `z.enum([...])` | `select` |
| `.optional()` | `required: false` |
| `.default(x)` | `default: x` |
| `.describe('...')` | `description` |

---

## Interruption

### CLI Keyboard Shortcuts

| Key | Action |
|-----|--------|
| **Ctrl+C** | Interrupt execution, return to prompt |

When interrupted:
- Current tool completes (or aborts)
- All pending tools return `{ type: 'interrupted' }`
- LLM sees the interruption and can summarize partial progress

> **Future:** Esc key support is planned. This would allow interrupting without the terminal's SIGINT handling, providing a smoother experience. Currently requires terminal raw mode which adds complexity.

### Programmatic API

Interrupt execution from code:

```typescript
import { createInterruptSignal } from '@anthropic/golem-forge';

const signal = createInterruptSignal();

const runtime = new WorkerRuntime({
  worker: workerDef,
  interruptSignal: signal,
});

// Trigger interrupt (called by UI on Ctrl+C)
signal.interrupt();

// Runtime checks signal each iteration
// Returns: { success: true, response: '[Interrupted]' }

signal.reset();  // Reset for next run
```

---

## Worker Depth

Workers track position in the delegation tree:

- **Root worker (depth=0)**: Converses with user, has chat history
- **Sub-workers (depth>0)**: Single-shot execution, no conversation

```typescript
const runtime = new WorkerRuntime({
  worker: workerDef,
  depth: 0,  // Root worker
});

runtime.getDepth();  // 0
runtime.isRoot();    // true
```

---

## Integration

Full integration example:

```typescript
const runtime = new WorkerRuntime({
  worker: workerDef,
  model: 'anthropic:claude-haiku-4-5',

  // UI
  uiAdapter: adapter,
  interruptSignal: signal,
  depth: 0,

  // Approval
  approvalMode: 'interactive',
  approvalCallback: createCLIApprovalCallback(),

  // Events
  onEvent: createTraceFormatter(),
});

await runtime.initialize();
const result = await runtime.run('Process the files');
```

---

## Semantic Tool Results

Tool results use a **semantic type system** that allows both well-known types and custom types. UIs render well-known types with specialized components and use display hints for custom types.

### Result Types

```typescript
// Well-known types
type WellKnownResultValue =
  | TextResultValue      // { kind: 'text', content: string }
  | DiffResultValue      // { kind: 'diff', path, original, modified, isNew, bytesWritten }
  | FileContentResultValue  // { kind: 'file_content', path, content, size }
  | FileListResultValue  // { kind: 'file_list', path, files, count }
  | JsonResultValue;     // { kind: 'json', data }

// Custom types for tool plugins
interface CustomResultValue {
  kind: string;          // e.g., 'git.status', 'db.query_result'
  data: unknown;         // Structured data
  summary?: string;      // Human-readable summary
  mimeType?: string;     // Content type hint
  display?: DisplayHints; // UI rendering hints
}
```

### Display Hints

All result types support display hints for UI customization:

```typescript
interface DisplayHints {
  preferredView?:
    | 'text'      // Plain text
    | 'markdown'  // Render as markdown
    | 'code'      // Syntax-highlighted code
    | 'table'     // Tabular data
    | 'tree'      // Hierarchical structure
    | 'hidden';   // Don't display

  language?: string;     // Language for code highlighting
  collapsed?: boolean;   // Start collapsed
  maxHeight?: number;    // Max display height
}
```

### Custom Result Example

A git tool returning structured status:

```typescript
const gitStatusTool = {
  name: 'git_status',
  execute: async () => {
    const status = await git.status();

    return {
      kind: 'git.status',  // Custom type
      data: {
        branch: status.current,
        staged: status.staged,
        modified: status.modified,
      },
      summary: `${status.staged.length} staged, ${status.modified.length} modified`,
      display: {
        preferredView: 'tree',
        collapsed: status.isClean,
      },
    };
  },
};
```

### Kind Validation

Custom kinds must follow the naming pattern:
- Lowercase letters, numbers, underscores
- Dots for namespacing (e.g., `git.status`, `mycompany.report`)
- Must start with a lowercase letter

```typescript
import { isValidKind, isWellKnownKind } from '@golem-forge/cli';

isValidKind('git.status');     // true
isValidKind('my_custom_type'); // true
isValidKind('Invalid');        // false (uppercase)
isWellKnownKind('text');       // true
isWellKnownKind('git.status'); // false
```

---

## Design Decisions

### Why Native needsApproval?

We use the AI SDK's native `needsApproval` pattern instead of wrapper classes:

1. **SDK Native**: First-class SDK support means less custom code
2. **Simpler**: Tools are self-describing, no interface proliferation
3. **Flexible**: Static boolean or dynamic function

### Why Manual Tool Execution?

We execute tools ourselves rather than using SDK's `maxSteps`:

1. **CLI Experience**: Synchronous approval prompts before execution
2. **Testing**: Easier to mock and verify behavior
3. **Flexibility**: Can add logging, metrics, error handling

### Zone vs Tool Approval

Zone approval is separate from zone `mode` (ro/rw):
- `mode` is about **capability** - what the sandbox allows
- `approval` is about **consent** - what the user must approve

A zone can be `rw` (writes possible) but still require approval for each write.

### Why Event-Driven UI?

We use an event-driven architecture instead of direct method calls:

1. **Decoupling**: Runtime doesn't know about UI implementation details
2. **Platform Agnostic**: Same events work for CLI (terminal) and browser (React)
3. **Testable**: Events can be recorded, replayed, and asserted on
4. **Concurrent**: Multiple pending operations handled naturally with correlation IDs
5. **Extensible**: New event types can be added without changing interfaces

The `RuntimeUI` wrapper provides convenience methods that translate to events internally, giving the best of both worlds.

### Why Semantic Tool Results?

We use a semantic type system for tool results instead of always returning strings:

1. **Rich Rendering**: UIs can display diffs, file trees, tables appropriately
2. **Extensible**: Custom types without changing core packages
3. **Graceful Degradation**: Unknown types fall back to tree/JSON view
4. **Summaries**: Tools provide human-readable summaries for compact display

---

## Related Documentation

- [Sandbox Design](./sandbox-design.md) - File system isolation and zones
- [Browser Extension Architecture](./browser-extension-architecture.md) - Browser-specific details
