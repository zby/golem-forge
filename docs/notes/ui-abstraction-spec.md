# UI Abstraction Layer Specification

**Date**: 2025-12-07
**Status**: Draft
**Related**: [ui-clearance-requirements.md](ui-clearance-requirements.md), [../sandbox-design.md](../sandbox-design.md)

## Overview

This document specifies a UI abstraction layer that:

1. Supports multiple platforms (CLI now, browser later)
2. Implements three trust modes for tool execution
3. Enables efficient context management through recursive workers
4. Maintains a chat-like UX without sacrificing control

### The Three Modes

| Mode | Description | UI Role |
|------|-------------|---------|
| **Autonomous** | Tool executes without prompting | Show progress |
| **Supervised** | Tool requires approval before execution | Approval dialog, worker pauses |
| **Manual** | User must initiate action (LLM cannot) | Clearance dashboard, user-driven |

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

  // === Approval (Supervised Mode) ===
  requestApproval(request: ApprovalRequest): Promise<ApprovalResult>;

  // === Clearance (Manual Mode) ===
  notifyClearancePending(items: ClearanceItem[]): void;
  getClearanceDecision(item: ClearanceItem): Promise<ClearanceDecision>;
  displayClearanceResult(result: ClearanceResult): void;
  onClearanceStateChange(callback: (items: ClearanceItem[]) => void): void;

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

interface ClearanceItem {
  id: string;
  type: 'staged_commit' | 'pending_export' | 'binary_output';
  description: string;
  createdAt: number;
  metadata: Record<string, unknown>;
}

type ClearanceDecision =
  | { action: 'push'; target?: string }
  | { action: 'discard' }
  | { action: 'defer' };
```

---

## 3. CLI Implementation

### Basic Adapter

```typescript
class CLIAdapter implements UIAdapter {
  private readline: Interface;

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

  notifyClearancePending(items: ClearanceItem[]): void {
    if (items.length > 0) {
      console.log(`\n[!] ${items.length} item(s) pending clearance`);
      console.log('    Run: golem clearance list');
    }
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
  private clearancePanel: ClearancePanel;
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

  notifyClearancePending(items: ClearanceItem[]): void {
    this.updateBadge(items.length);
    this.clearancePanel.update(items);
  }

  showProgress(task: TaskProgress): void {
    this.progressTree.update(task);
  }
}
```

Browser UI enables:
- Collapsible worker tree
- Syntax-highlighted diff viewer
- Real-time parallel worker status

---

## 5. Approval Flow (Supervised Mode)

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

### Approval vs Clearance

| Aspect | Approval (Supervised) | Clearance (Manual) |
|--------|----------------------|-------------------|
| When | Before action | After action |
| Blocking | Yes | No |
| User action | Approve/reject | Push/discard |

---

## 6. Clearance Flow (Manual Mode)

Clearance operations can occur at any depth. Results bubble up; user decisions are reported back to root.

```
User: "Write the quarterly report"

Root → Worker: Writes report, stages commit
       Returns: { staged: true, commitId: "pending-abc" }

Root: "I've written the report and staged it.
       Review with 'golem clearance diff' and push when ready."

... time passes ...

User: golem clearance push

System injects into Root's context:
  "[System: User pushed staged commit to main]"

Root: "Great, the report is now in the main branch."
```

---

## 7. Implementation Plan

### Phase 1: Core Abstraction
1. Define `UIAdapter` interface
2. Implement `CLIAdapter`
3. Wire into existing worker system
4. Add clearance notifications

### Phase 2: Worker Context Model
1. Add `depth` tracking
2. Modify context building: `chatHistory` only at depth=0
3. Support re-invocation with clarified tasks
4. Add progress display

### Phase 3: Rich Clearance UI
1. Implement `golem clearance` CLI commands
2. Add diff viewing
3. Status bar integration

### Phase 4: Browser UI
1. Implement `BrowserAdapter`
2. WebSocket layer
3. React components

---

## 8. Open Questions

### Maximum Recursion Depth

**Tentative**: Soft limit of 3-4 levels.

### Parallel Worker Presentation

**Tentative**: Progress bar with expand-on-demand.

---

## Summary

The UI abstraction layer provides:

1. **Platform independence** via `UIAdapter` interface
2. **Simple two-tier model** - root converses, sub-workers execute
3. **Context efficiency** - only root has chat history
4. **Re-invocation pattern** - parent clarifies and re-invokes child
5. **Three trust modes** - Autonomous, Supervised, Manual

**Key insight**: Sub-workers don't need conversation. They get a task, run tools, return a result. If they lack information, the parent re-invokes with a better task description. This keeps the model simple and context efficient.
