# UI Abstraction Layer Specification

**Date**: 2025-12-07
**Status**: Implemented (Phases 1-3)
**Implementation**: See [../../ui-abstraction.md](../../ui-abstraction.md) for documentation
**Related**: [../ui-clearance-requirements.md](../ui-clearance-requirements.md), [../../sandbox-design.md](../../sandbox-design.md)

> **Note**: This spec has been implemented. Phases 1-3 (Core Abstraction, Manual Tools, Worker Context) are complete. Phases 4-5 (Universal Manual Tools, Browser UI) are pending.

## Overview

This document specifies a UI abstraction layer that:

1. Supports multiple platforms (CLI now, browser later)
2. Implements three execution modes for tools
3. Enables efficient context management through recursive workers
4. Maintains a chat-like UX without sacrificing control

### The Three Execution Modes

| Mode | Description | UI Role |
|------|-------------|---------|
| **LLM** | Tool can only be invoked by LLM | Show progress (default, current behavior) |
| **Manual** | Tool can only be invoked by user | Display in manual tools list, accept user input |
| **Both** | Tool can be invoked by LLM or user | Both behaviors |

### Approval vs Execution Mode

These are orthogonal concerns:

| Concept | Question | Configured By |
|---------|----------|---------------|
| **Execution Mode** | Who can invoke the tool? | Tool definition (`manualExecution.mode`) |
| **Approval** | Does invocation require confirmation? | Tool definition + worker config (`needsApproval`) |

A manual-mode tool can still require approval (e.g., "Push to remote" - user invokes, but confirms before execution).

### Core Architecture

The system uses a **two-tier model**:

- **Root worker (depth=0)**: Maintains conversation with user. Multi-turn, has chat history.
- **Sub-workers (depth>0)**: Single-shot tool loops. No user messages, no conversation memory.

If a sub-worker lacks information, the parent can re-invoke it with a more complete task description. Questions bubble up until answered—ultimately reaching the user if needed.

---

## 1. Worker Architecture

### Root Worker

The root worker is the only agent that converses with the user:

```
┌─────────────────────────────────────────────────────────────────┐
│  Root Worker (depth=0)                                          │
│                                                                  │
│  Context:                                                        │
│  - Full chat history with user                                  │
│  - System state (pending clearance, etc.)                       │
│                                                                  │
│  Capabilities:                                                   │
│  - Spawn sub-workers                                            │
│  - Use tools                                                     │
│  - Converse with user (multi-turn)                              │
└─────────────────────────────────────────────────────────────────┘
```

### Sub-Workers

Sub-workers are single-shot: task in → result out. They run a tool loop but don't converse with the user. (Their tool calls may still trigger approval dialogs in Supervised mode.)

```
┌─────────────────────────────────────────────────────────────────┐
│  Sub-Worker (depth>0)                                           │
│                                                                  │
│  Context:                                                        │
│  - Task description from parent                                 │
│  - NO chat history                                              │
│                                                                  │
│  Capabilities:                                                   │
│  - Use tools                                                     │
│  - Spawn sub-sub-workers                                        │
│  - Return result or request input                               │
│                                                                  │
│  Cannot:                                                         │
│  - Converse with user (but tools may trigger approvals)         │
│  - Access parent's chat history                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Context Model

```typescript
interface WorkerContext {
  task: TaskDescription;
  tools: ToolDefinition[];
  systemPrompt: string;

  // Only root (depth=0) has this
  chatHistory?: Message[];

  // Results from prior sibling workers
  priorResults?: Map<string, unknown>;

  // Position
  depth: number;
  parentId?: string;
}
```

### Re-invocation Pattern

If a sub-worker can't complete its task (missing information, ambiguity, etc.), the parent can re-invoke it with a clarified task description. If the parent also lacks the information, it bubbles up—ultimately reaching the user.

```
Root (d=0): "Refactor auth to use JWT"
│ Context: User said "use the same secret key as the API"
│
└─→ Worker (d=1): "Implement JWT signing"
    │ Worker is unsure about which secret key to use
    │
    ◄─ Parent knows from chat history, re-invokes:
    │
    └─→ Worker (d=1): "Implement JWT signing using API_SECRET_KEY"
        └─→ Completes successfully
```

If no ancestor can answer:

```
Root (d=0): "Set up authentication"
│
└─→ Worker (d=1): "Configure sessions"
    │ Worker unclear on storage backend
    │
    ◄─ Root doesn't know either, asks user:
       "Should I use Redis or in-memory sessions?"

User: "Redis"

Root re-invokes:
│
└─→ Worker (d=1): "Configure sessions using Redis"
    └─→ Completes successfully
```

### Benefits

1. **Simple model** - Root converses, sub-workers execute
2. **Context efficiency** - Sub-workers get minimal context
3. **No user confusion** - User only ever talks to root
4. **Clean re-invocation** - Failed attempts don't pollute context

---

## 2. UI Abstraction Interface

### Core Interface

```typescript
interface UIAdapter {
  // === Conversation ===
  displayMessage(msg: Message): Promise<void>;
  getUserInput(): Promise<string>;

  // === Approval ===
  requestApproval(request: ApprovalRequest): Promise<ApprovalResult>;

  // === Manual Tools ===
  displayManualTools(tools: ManualToolInfo[]): void;
  onManualToolRequest(handler: ManualToolHandler): void;

  // === Interruption ===
  onInterrupt(handler: () => void): void;

  // === Progress ===
  showProgress(task: TaskProgress): void;
  updateStatus(status: StatusUpdate): void;

  // === Diff Review ===
  displayDiff(diff: DiffContent): Promise<void>;

  // === Lifecycle ===
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}
```

### Supporting Types

```typescript
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    toolCalls?: ToolCall[];
    timestamp: number;
  };
}

interface ApprovalRequest {
  type: 'tool_call' | 'file_write' | 'command';
  description: string;
  details: unknown;
  risk: 'low' | 'medium' | 'high';
  workerPath: WorkerInfo[];  // Context: [root, ..., current]
}

interface WorkerInfo {
  id: string;
  depth: number;
  task: string;
}

type ApprovalResult =
  | { approved: true }
  | { approved: false; reason?: string }
  | { approved: 'always' }
  | { approved: 'session' };
```

### Manual Tool Types

```typescript
// Execution mode for tools
type ExecutionMode = 'llm' | 'manual' | 'both';

// Tool-level configuration
interface ManualExecutionConfig {
  mode: ExecutionMode;
  label?: string;      // Human-readable name (defaults to tool name)
  category?: string;   // Grouping in UI (e.g., "Git Operations")
}

// Extended NamedTool (addition to existing type)
interface NamedTool {
  name: string;
  description: string;
  inputSchema: ZodType;
  execute: (input, options) => Promise<unknown>;
  needsApproval?: boolean | ((input, options) => boolean | Promise<boolean>);
  manualExecution?: ManualExecutionConfig;  // NEW
}

// UI representation of a manual tool
interface ManualToolInfo {
  name: string;
  label: string;
  description: string;
  category?: string;
  fields: ManualToolField[];
}

// Field types derivable from Zod schema
type FieldType = 'text' | 'number' | 'select' | 'boolean';

interface ManualToolField {
  name: string;
  description: string;
  type: FieldType;
  required: boolean;
  options?: string[];  // For 'select' type
  default?: unknown;
}

// Handler for manual tool invocation
type ManualToolHandler = (
  toolName: string,
  args: Record<string, unknown>
) => Promise<ManualToolResult>;

interface ManualToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}
```

### Deriving Fields from Zod Schema

The UI can derive field definitions from Zod schemas automatically:

| Zod Type | Field Type | Notes |
|----------|------------|-------|
| `z.string()` | `text` | |
| `z.number()` | `number` | |
| `z.boolean()` | `boolean` | |
| `z.enum(['a', 'b'])` | `select` | Options from enum values |
| `z.literal('a').or(z.literal('b'))` | `select` | Options from literals |
| `.optional()` | | Sets `required: false` |
| `.default(x)` | | Sets `default: x` |
| `.describe('...')` | | Sets `description` |

```typescript
// Utility function (src/ui/schema-to-fields.ts)
function deriveFieldsFromSchema(schema: ZodObject<any>): ManualToolField[];
```

### Interruption

```typescript
// Interrupt signal checked by tool loop
interface InterruptSignal {
  interrupted: boolean;
  interrupt(): void;
}

// Tool result includes interrupted state
type ToolResult<T = unknown> =
  | { type: 'success'; value: T }
  | { type: 'error'; error: string }
  | { type: 'interrupted'; partial?: Partial<T> };

// UIAdapter registers Esc handler that triggers the signal
// All in-flight tools return { type: 'interrupted' }
// Control returns to user prompt in level 0 worker context
```

---

## 3. CLI Implementation

### Basic Adapter

```typescript
class CLIAdapter implements UIAdapter {
  private readline: Interface;
  private manualToolHandler?: ManualToolHandler;

  async displayMessage(msg: Message): Promise<void> {
    const prefix = msg.role === 'user' ? 'You:' : 'Golem:';
    console.log(`${prefix} ${msg.content}`);
  }

  async getUserInput(): Promise<string> {
    return new Promise(resolve => {
      this.readline.question('> ', resolve);
    });
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalResult> {
    console.log(`\n[Approval Required] ${request.description}`);
    console.log(`Risk: ${request.risk}`);

    const answer = await this.prompt('[y]es / [n]o / [a]lways / [s]ession: ');
    return this.parseApprovalAnswer(answer);
  }

  displayManualTools(tools: ManualToolInfo[]): void {
    console.log('\nAvailable manual tools:');

    const byCategory = groupBy(tools, t => t.category ?? 'General');
    for (const [category, categoryTools] of Object.entries(byCategory)) {
      console.log(`\n  ${category}:`);
      for (const tool of categoryTools) {
        console.log(`    ${tool.name} - ${tool.description}`);
      }
    }

    console.log('\nRun: golem tool <name> [--arg value ...]');
  }

  onManualToolRequest(handler: ManualToolHandler): void {
    this.manualToolHandler = handler;
  }

  showProgress(task: TaskProgress): void {
    const indent = '  '.repeat(task.depth);
    const symbol = task.status === 'complete' ? '✓' :
                   task.status === 'running' ? '●' : '○';
    console.log(`${indent}${symbol} ${task.description}`);
  }
}
```

### CLI Output: First Iteration

For the first iteration, sub-workers stream their full output to the console, just like the root worker. The existing event system and trace formatter handle this - we just need to pass the `onEvent` callback when creating child runtimes.

**Current gap**: In `src/tools/worker-call.ts`, child runtimes are created without an `onEvent` callback, so sub-worker events are not displayed. Fix: pass the callback through.

```
You: Add error handling to the payment module

Golem: I'll add error handling to the payment module.

[Calling worker: analyze-payment]
┌─ analyze-payment ────────────────────────────────────────────────┐
│ read_file("src/payment/processor.ts")                            │
│ grep("throw|catch", "src/payment/")                              │
│ Found 3 functions lacking error handling                         │
└──────────────────────────────────────────────────────────────────┘

[Calling worker: implement-changes]
┌─ implement-changes ──────────────────────────────────────────────┐
│ edit_file("src/payment/processor.ts", ...)                       │
│ edit_file("src/payment/processor.ts", ...)                       │
│ Modified 3 functions                                             │
└──────────────────────────────────────────────────────────────────┘

Golem: Done! Added try/catch to processPayment(), validateCard(),
       and refund().
```

### Future: Progress Indicators

Later iterations may add summary modes with progress bullets instead of full output:

```
  ● Analyzing payment module...
  ✓ Analyzed (3 functions need changes)
  ● Implementing error handling...
```

But for now, full streaming keeps it simple and debuggable.

---

## 4. Browser Implementation (Future)

```typescript
class BrowserAdapter implements UIAdapter {
  private ws: WebSocket;
  private manualToolsPanel: ManualToolsPanel;
  private diffViewer: DiffViewer;

  async displayMessage(msg: Message): Promise<void> {
    this.renderMessageBubble(msg);
    this.scrollToBottom();
  }

  async requestApproval(request: ApprovalRequest): Promise<ApprovalResult> {
    return new Promise(resolve => {
      this.showApprovalModal(request, resolve);
    });
  }

  displayManualTools(tools: ManualToolInfo[]): void {
    this.manualToolsPanel.update(tools);
  }

  showProgress(task: TaskProgress): void {
    this.progressTree.update(task);
  }
}
```

Browser UI enables:
- Collapsible worker tree
- Manual tools sidebar (always visible)
- Syntax-highlighted diff viewer
- Real-time parallel worker status

---

## 5. Approval Flow

When any worker (at any depth) invokes a tool requiring approval, the request bubbles up to the user. The entire worker tree pauses.

```
Root (d=0): "Refactor the database"
│
└─→ Worker (d=1): "Update schema"
    │
    └─→ Worker (d=2): "Migrate production"
        │ bash("psql -c 'ALTER TABLE...'")
        ╳ BLOCKED - requires approval

[Approval Required] bash("psql -c 'ALTER TABLE users...'")
Risk: high
Path: refactor-db → update-schema → migrate-prod

[y]es / [n]o / [a]lways / [s]ession: y

        └─→ Command executes, worker continues
```

Note: Approval applies to both LLM-invoked and manually-invoked tools. A manual tool with `needsApproval: true` still requires confirmation.

---

## 6. Manual Tool Execution

### Concept

Manual tools are tools that can only be invoked by the user, not by the LLM. This is useful for:

- **Clearance operations**: Pushing commits, deploying, exporting data
- **Destructive actions**: Operations too risky for LLM to initiate
- **Compliance boundaries**: Actions requiring explicit human authorization

### Tool Availability by Worker

Tools are configured per worker. A worker without manual tools can only return output - it cannot trigger user-invokable actions.

```
Root Worker (has git_push manual tool)
│
├─→ Analysis Worker (read-only tools, no manual tools)
│   └─→ Returns: "Found 3 issues in auth.ts"
│
└─→ Fix Worker (filesystem write, no git tools)
    └─→ Writes files, returns: "Fixed 3 issues"

Root: "I've fixed the issues. Files are modified locally."

User can now invoke: golem tool git_push --branch main
```

### Example: Git Push as Manual Tool

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
    // Tool writer handles the actual push logic
    const args = force ? ['push', '-f', remote, branch] : ['push', remote, branch];
    return execGit(args);
  },

  needsApproval: true,  // Still requires confirmation even when manually invoked

  manualExecution: {
    mode: 'manual',           // User only - LLM cannot push
    label: 'Push to Remote',
    category: 'Git Operations',
  },
};
```

### CLI Commands

```bash
# List available manual tools for current worker
golem tools --manual

# Output:
# Available manual tools:
#
#   Git Operations:
#     git_push - Push commits to remote repository
#     git_tag - Create and push a tag
#
# Run: golem tool <name> [--arg value ...]

# Invoke a manual tool with arguments
golem tool git_push --remote origin --branch main

# Interactive mode (prompts for each field)
golem tool git_push -i

# Output:
# [git_push] Push to Remote
# remote (origin/upstream) [origin]: origin
# branch: main
# force (true/false) [false]: false
#
# [Approval Required] git push origin main
# [y]es / [n]o: y
#
# ✓ Pushed to origin/main
```

### Workflow Example: Clearance via Manual Tools

```
User: "Write the quarterly report and commit it"

Root → Worker: Writes report, creates local commit
       Returns: { committed: true, sha: "abc123" }

Root: "I've written the report and committed it locally (abc123).
       When ready, push with: golem tool git_push --branch main"

... user reviews the commit ...

User: golem tool git_push --branch main

[Approval Required] git push origin main
[y]es / [n]o: y

✓ Pushed to origin/main

# System injects result into conversation
Root: "The report has been pushed to main."
```

### Key Design Points

1. **No special clearance system** - clearance is just manual tools with appropriate semantics
2. **Tool writers own the logic** - they decide what a tool does, UI just provides invocation
3. **Composable via worker config** - which workers have which manual tools is configuration
4. **Approval is orthogonal** - manual tools can still require confirmation before execution

### When Can Users Invoke Manual Tools?

Manual tools are available at **natural pause points**, not during active tool loops:

| Context | When Available | Mechanism |
|---------|----------------|-----------|
| Root worker (d=0) | Waiting for user message | Command at prompt |
| Child returning | Worker with manual tools completes | Transition prompt |

**Phase 1 (Simplified)**: Manual tools only on root worker. User invokes via command at prompt:

```
You: Fix the bug and commit it

Golem: [runs tools, commits locally]
       Done! Committed as abc123.

You: /tool git_push --branch main

✓ Pushed to origin/main

You: Thanks!
```

**Phase 2 (Universal)**: When any worker with manual tools completes, the parent pauses and offers a transition prompt:

```
[Worker 'deploy-worker' completed]
This worker has manual tools available:
  deploy_service - Deploy to production

[c]ontinue / [t]ool: t
> deploy_service --env staging

✓ Deployed to staging

[c]ontinue / [t]ool: c

Golem: Deployment complete!
```

### CLI Command Syntax

At the root worker prompt, `/` commands are intercepted locally (not sent to LLM):

**Built-in Commands** (always available):
```bash
/help                 # Show available commands
/model [name]         # Show or switch LLM model
/model list           # List available models
/clear                # Clear conversation history
/status               # Show worker state, pending tools
/config [key] [value] # View or change settings
/exit                 # Exit session
```

**Manual Tool Commands** (worker-specific):
```bash
/tools                # List available manual tools
/tool <name> [--arg]  # Invoke a manual tool
/tool <name> -i       # Interactive mode (prompt for args)

# Short forms
/t git_push --branch main
/ts
```

**Direct tool invocation** (if unambiguous):
```bash
/git_push --branch main    # Same as /tool git_push --branch main
```

Built-in commands take precedence over tool names if there's a conflict.

### Escape: Interrupting the Tool Loop

Users can press **Esc** during execution to interrupt and return to the prompt:

```
You: Refactor all the authentication code

Golem: [reading files...]
       [editing src/auth/login.ts...]
       [editing src/auth/session.ts...]

       ← User presses Esc

[Interrupted]

You: /tools

Available manual tools:
  git_push - Push commits to remote

You: /tool git_push --branch main
✓ Pushed to origin/main

You: Continue refactoring

Golem: I was interrupted while refactoring. I had edited 2 files
       (login.ts, session.ts). Continuing...
```

**Behavior**:
- **Esc**: Interrupt all tools, return to user prompt
- All in-flight tools (including child workers) return with `UserInterrupt` result
- Control returns to user, within level 0 worker context
- User can invoke manual tools or send a new message
- Next LLM turn sees the interrupt results and can summarize/continue

**Result Type**:
```typescript
type ToolResult =
  | { type: 'success'; value: unknown }
  | { type: 'error'; error: string }
  | { type: 'interrupted'; completed?: Partial<unknown> };
```

**Implementation**:
- Tool loop checks interrupt signal before each tool
- On Esc, signal is set, current tool completes (or aborts), all return `interrupted`
- Child workers propagate interrupt up as their result

---

## 7. Implementation Plan

### Testing Approach

All automated tests use **mocked LLMs** - no real API calls:

- Unit tests: Pure functions, no LLM needed
- Integration tests: Mock LLM that returns predetermined tool calls
- E2E tests: Mock LLM with scripted conversation flows

This ensures tests are:
- **Fast**: No network latency
- **Deterministic**: Same input → same output
- **Free**: No API costs
- **Offline**: Run anywhere

```typescript
// Example mock LLM for testing
const mockLLM = createMockLLM([
  { response: 'I will read the file', toolCalls: [{ name: 'read_file', args: { path: '/test.txt' } }] },
  { response: 'Done!' },
]);
```

### Phase 1: Core Abstraction
1. Define `UIAdapter` interface
2. Implement `CLIAdapter`
3. Wire into existing worker system
4. **Testing**: Unit tests for UIAdapter contract, mock adapter for testing

### Phase 2: Manual Tools & Commands (Root Only)
1. Add `ManualExecutionConfig` to `NamedTool` type
2. Implement `deriveFieldsFromSchema()` utility
3. Add tool filtering in `WorkerRuntime` (LLM vs manual)
4. Implement `/` command parser at prompt
5. Built-in commands: `/help`, `/model`, `/clear`, `/status`, `/exit`
6. Manual tool commands: `/tools`, `/tool <name>`, `/<toolname>`
7. Implement Esc interrupt handler (raw mode keyboard input)
8. Add interrupt signal check in tool loop, return to prompt on interrupt
9. **Testing**:
   - Unit tests for `deriveFieldsFromSchema()` with various Zod types
   - Unit tests for `/` command parser
   - Unit tests for tool filtering (LLM vs manual vs both)
   - Integration tests for interrupt signal propagation
   - E2E test: manual tool invocation flow

### Phase 3: Worker Context Model
1. Add `depth` tracking
2. Modify context building: `chatHistory` only at depth=0
3. Support re-invocation with clarified tasks
4. Add progress display
5. **Testing**:
   - Unit tests for depth tracking
   - Integration tests for context isolation between depths
   - E2E test: nested worker with re-invocation

### Phase 4: Manual Tools (Universal)
1. Add transition prompt when worker with manual tools returns
2. Parent pauses, offers `[c]ontinue / [t]ool` choice
3. Wire manual tool results back into conversation
4. **Testing**:
   - Integration tests for transition prompt flow
   - E2E test: child worker with manual tools

### Phase 5: Browser UI
1. Implement `BrowserAdapter`
2. WebSocket layer
3. React components for manual tool invocation
4. Persistent manual tool sidebar/panel
5. **Testing**:
   - Unit tests for BrowserAdapter
   - Component tests for React UI
   - E2E tests with Playwright or similar

---

## 8. Open Questions

### Maximum Recursion Depth

**Tentative**: Soft limit of 3-4 levels.

### Parallel Worker Presentation

**Tentative**: Progress bar with expand-on-demand.

### Interruption Mechanism

**Decided** (Phase 2):
- **Esc**: Hard interrupt - stop tool loop, return to prompt
- No menu, no soft interrupt (keep it simple)

**Future options**:
- Soft interrupt with `[c]ontinue / [a]bort / [t]ool` menu
- With nested workers: interrupt leaf only, branch, or all

### Manual Tool Result Injection

When a user invokes a manual tool, should the result be injected into the conversation context?

**Options**:
- Always inject as system message
- Inject only if tool returns meaningful output
- Never inject, let user describe what happened

**Tentative**: Inject as system message so LLM is aware of what happened.

---

## Summary

The UI abstraction layer provides:

1. **Platform independence** via `UIAdapter` interface
2. **Simple two-tier model** - root converses, sub-workers execute
3. **Context efficiency** - only root has chat history
4. **Re-invocation pattern** - parent clarifies and re-invokes child
5. **Three execution modes** - LLM, Manual, Both

**Key insights**:

- Sub-workers don't need conversation. They get a task, run tools, return a result. If they lack information, the parent re-invokes with a better task description.

- Clearance is not a special system - it's just manual tools with appropriate semantics. Tool writers decide what their tools do; the UI provides invocation and input.

- Execution mode (who can invoke) is orthogonal to approval (does invocation require confirmation). A manual tool can still require approval.

- Tool availability per worker creates natural boundaries. Workers without manual tools can only return output - they cannot trigger user-invokable actions.
