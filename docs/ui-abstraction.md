# UI Abstraction Layer

## Overview

The UI abstraction layer provides platform-independent UI for worker execution. It enables the same worker code to run with different UI implementations (CLI, browser, etc.) while supporting:

- **Multiple platforms**: CLI now, browser later
- **Three execution modes**: LLM-invoked, user-invoked, or both
- **Efficient context management**: Recursive workers with depth tracking
- **Graceful interruption**: Interrupt execution and return to prompt

```
                    Shared Core
                    ┌─────────────────────────────────┐
                    │  • WorkerRuntime                │
                    │  • Tool definitions             │
                    │  • Approval system              │
                    └──────────────┬──────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              │                                         │
              ▼                                         ▼
    ┌─────────────────────┐              ┌──────────────────────────┐
    │     CLIAdapter      │              │    BrowserAdapter        │
    │                     │              │    (future)              │
    │  • Terminal I/O     │              │                          │
    │  • readline prompts │              │  • WebSocket messages    │
    │  • boxen panels     │              │  • React components      │
    └─────────────────────┘              └──────────────────────────┘
```

---

## Key Concepts

### Execution Modes

Tools can be invoked by the LLM, the user, or both:

| Mode | Description | Example |
|------|-------------|---------|
| `llm` | Only LLM can invoke (default) | `read_file`, `write_file` |
| `manual` | Only user can invoke | `git_push`, `deploy` |
| `both` | Either can invoke | `run_tests` |

This is configured per-tool via `manualExecution.mode`:

```typescript
const gitPushTool: NamedTool = {
  name: 'git_push',
  description: 'Push commits to remote',
  inputSchema: z.object({
    branch: z.string().describe('Target branch'),
    force: z.boolean().default(false),
  }),
  execute: async ({ branch, force }) => { ... },

  // Manual execution config
  manualExecution: {
    mode: 'manual',           // User only
    label: 'Push to Remote',  // Human-readable name
    category: 'Git',          // Grouping in UI
  },
};
```

### Execution Mode vs Approval

These are orthogonal concerns:

| Concept | Question | Configured By |
|---------|----------|---------------|
| **Execution Mode** | Who can invoke? | `manualExecution.mode` |
| **Approval** | Requires confirmation? | `needsApproval` |

A manual tool can still require approval (e.g., "Push to remote" - user invokes, but confirms before execution).

### Worker Depth

Workers track their position in the delegation tree:

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

## UIAdapter Interface

The `UIAdapter` interface defines platform-independent UI operations:

```typescript
interface UIAdapter {
  // Conversation
  displayMessage(msg: Message): Promise<void>;
  getUserInput(prompt?: string): Promise<string>;

  // Approval
  requestApproval(request: UIApprovalRequest): Promise<UIApprovalResult>;

  // Manual Tools
  displayManualTools(tools: ManualToolInfo[]): void;
  onManualToolRequest(handler: ManualToolHandler): void;

  // Interruption
  onInterrupt(handler: () => void): void;

  // Progress
  showProgress(task: TaskProgress): void;
  updateStatus(status: StatusUpdate): void;

  // Diff Review
  displayDiff(diff: DiffContent): Promise<void>;

  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}
```

### CLIAdapter

The CLI implementation uses readline for input and boxen/picocolors for styled output:

```typescript
import { CLIAdapter, createCLIAdapter } from '@anthropic/golem-forge';

const adapter = createCLIAdapter({
  promptPrefix: '> ',
  enableRawMode: true,
});

await adapter.initialize();

// Display messages
await adapter.displayMessage({
  role: 'assistant',
  content: 'Hello! How can I help?',
});

// Get user input
const input = await adapter.getUserInput();

await adapter.shutdown();
```

---

## Slash Commands

Users can invoke commands at the prompt using `/` prefix:

### Built-in Commands

```bash
/help                 # Show available commands
/model [name]         # Show or switch LLM model
/clear                # Clear conversation history
/status               # Show worker state
/tools                # List available manual tools
/exit                 # Exit session
```

### Manual Tool Commands

```bash
/tool git_push --branch main    # Invoke a manual tool
/tool git_push -i               # Interactive mode
/t git_push --branch main       # Short form
/git_push --branch main         # Direct invocation (if tool exists)
```

### Command Parser API

```typescript
import { parseCommand, classifyCommand, isCommand } from '@anthropic/golem-forge';

const input = '/tool git_push --branch main';

if (isCommand(input)) {
  const parsed = parseCommand(input);
  // { name: 'tool', args: ['git_push'], options: { branch: 'main' } }

  const classified = classifyCommand(parsed, ['git_push', 'deploy']);
  // { type: 'tool', toolName: 'git_push', parsed }
}
```

---

## Tool Filtering

Filter tools based on execution mode:

```typescript
import {
  getManualTools,
  getLLMTools,
  isManualTool,
  isLLMTool
} from '@anthropic/golem-forge';

const allTools = runtime.getTools();

// Get tools for LLM (mode: 'llm' or 'both' or no config)
const llmTools = getLLMTools(allTools);

// Get manual tools (mode: 'manual' or 'both')
const manualTools = getManualTools(allTools);
// Returns ManualToolInfo[] with fields derived from schema

// Check individual tools
if (isManualTool(tool)) {
  // Tool can be user-invoked
}
```

---

## Schema to Fields

Automatically derive form fields from Zod schemas:

```typescript
import { deriveFieldsFromSchema } from '@anthropic/golem-forge';

const schema = z.object({
  branch: z.string().describe('Target branch'),
  remote: z.enum(['origin', 'upstream']).default('origin'),
  force: z.boolean().default(false).describe('Force push'),
});

const fields = deriveFieldsFromSchema(schema);
// [
//   { name: 'branch', type: 'text', required: true, description: 'Target branch' },
//   { name: 'remote', type: 'select', required: false, options: ['origin', 'upstream'], default: 'origin' },
//   { name: 'force', type: 'boolean', required: false, default: false, description: 'Force push' },
// ]
```

### Supported Zod Types

| Zod Type | Field Type | Notes |
|----------|------------|-------|
| `z.string()` | `text` | |
| `z.number()` | `number` | |
| `z.boolean()` | `boolean` | |
| `z.enum([...])` | `select` | Options from enum values |
| `z.literal().or()` | `select` | Options from literals |
| `.optional()` | | Sets `required: false` |
| `.default(x)` | | Sets `default: x` |
| `.describe('...')` | | Sets `description` |

---

## Interruption

Gracefully interrupt execution:

```typescript
import { createInterruptSignal, InterruptError } from '@anthropic/golem-forge';

const signal = createInterruptSignal();

// Pass to runtime
const runtime = new WorkerRuntime({
  worker: workerDef,
  interruptSignal: signal,
});

// In UI handler (e.g., Esc key)
signal.interrupt();

// Runtime checks signal each iteration
// Returns: { success: true, response: '[Interrupted]' }

// Reset for next run
signal.reset();
```

### Interrupt Signal API

```typescript
interface InterruptSignal {
  interrupted: boolean;  // Check if interrupted
  interrupt(): void;     // Trigger interrupt
  reset(): void;         // Reset for next run
}
```

---

## Integration with WorkerRuntime

The UI adapter integrates via `WorkerRunnerOptions`:

```typescript
const runtime = new WorkerRuntime({
  worker: workerDef,
  model: 'anthropic:claude-haiku-4-5',

  // UI integration
  uiAdapter: adapter,           // Optional UI adapter
  interruptSignal: signal,      // Optional interrupt signal
  depth: 0,                     // Worker depth (0 = root)

  // Standard options
  approvalMode: 'interactive',
  approvalCallback: createCLIApprovalCallback(),
  onEvent: createTraceFormatter(),
});

await runtime.initialize();
const result = await runtime.run('Process the files');
```

---

## Manual Tool Example

Complete example of a manual-only tool:

```typescript
import { z } from 'zod';
import type { NamedTool } from '@anthropic/golem-forge';

export const deployTool: NamedTool = {
  name: 'deploy',
  description: 'Deploy application to environment',

  inputSchema: z.object({
    env: z.enum(['staging', 'production']).describe('Target environment'),
    version: z.string().optional().describe('Version tag'),
    dryRun: z.boolean().default(false).describe('Preview without deploying'),
  }),

  execute: async ({ env, version, dryRun }) => {
    if (dryRun) {
      return { status: 'preview', env, version };
    }
    // Actual deployment logic
    return { status: 'deployed', env, version };
  },

  needsApproval: ({ env }) => env === 'production',  // Approval for prod only

  manualExecution: {
    mode: 'manual',
    label: 'Deploy Application',
    category: 'Operations',
  },
};
```

Usage in CLI:
```bash
/tool deploy --env staging
# Executes immediately (no approval for staging)

/tool deploy --env production
# [Approval Required] Deploy to production
# [y]es / [n]o: y
# ✓ Deployed to production
```

---

## Future: Browser Adapter

The browser adapter will implement the same interface with web technologies:

```typescript
class BrowserAdapter implements UIAdapter {
  private ws: WebSocket;

  async displayMessage(msg: Message): Promise<void> {
    this.renderMessageBubble(msg);
  }

  async requestApproval(request: UIApprovalRequest): Promise<UIApprovalResult> {
    return new Promise(resolve => {
      this.showApprovalModal(request, resolve);
    });
  }

  displayManualTools(tools: ManualToolInfo[]): void {
    this.manualToolsPanel.update(tools);
  }
}
```

Features enabled by browser UI:
- Collapsible worker tree
- Manual tools sidebar
- Syntax-highlighted diff viewer
- Real-time parallel worker status

---

## Related Documentation

- [Tool Approval Design](./tool-approval-design.md) - How approval works
- [Sandbox Design](./sandbox-design.md) - File system isolation
- [Browser Extension Architecture](./browser-extension-architecture.md) - Browser-specific details
