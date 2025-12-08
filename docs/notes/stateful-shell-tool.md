# Stateful/Persistent Shell Tool for LLM Agents

## Overview

A persistent shell tool allows an LLM to maintain terminal state across multiple tool calls, and potentially allows users to take over the terminal and correct LLM commands.

## AI SDK Compatibility

The Vercel AI SDK does not have built-in support for stateful tools - tools are designed to be stateless with each `execute` function receiving inputs and returning results within a single invocation.

However, this doesn't prevent building a stateful shell tool - you manage the state at the application level.

## Implementation Pattern

### Session Management

Create shell sessions that persist in memory with unique IDs using PTY (pseudo-terminal) integration:

```typescript
import * as pty from 'node-pty';

const shellSessions = new Map<string, PTYSession>();

const tools = {
  createShell: tool({
    description: 'Create a new persistent shell session',
    parameters: z.object({}),
    execute: async () => {
      const id = crypto.randomUUID();
      shellSessions.set(id, new PTYSession());
      return { sessionId: id };
    }
  }),
  runCommand: tool({
    description: 'Run command in existing shell session',
    parameters: z.object({
      sessionId: z.string(),
      command: z.string()
    }),
    execute: async ({ sessionId, command }) => {
      const session = shellSessions.get(sessionId);
      return session.execute(command);
    }
  })
};
```

## Key Challenge: Presenting State Changes to the LLM

When a user takes over the terminal and types commands, how does the LLM learn about these changes?

### Option 1: Polling/Snapshot on Next Tool Call

Include current terminal state in every tool response:

```typescript
runCommand: tool({
  execute: async ({ sessionId, command }) => {
    const session = shellSessions.get(sessionId);
    const result = await session.execute(command);
    return {
      output: result,
      terminalSnapshot: session.getScreenBuffer(),
      workingDirectory: session.getCwd(),
      lastModified: session.getLastActivityTime()
    };
  }
})
```

**Limitation**: LLM doesn't know about changes until it makes a tool call.

### Option 2: Inject State Changes as Messages

When user activity is detected in the terminal, inject a message into the conversation:

```typescript
ptySession.onUserInput((input, output) => {
  conversation.addMessage({
    role: 'user',
    content: `[Terminal Update] User executed command in session ${sessionId}:
$ ${input}
${output}

Current working directory: ${session.getCwd()}`
  });
});
```

This matches how AI SDKs expect to receive information - as messages in the conversation.

### Option 3: Event-Driven with Human-in-the-Loop (Recommended)

Treat user terminal input as "human feedback" - buffer user actions and inject before the next LLM turn:

```typescript
class ManagedTerminal {
  private pendingUserActions: string[] = [];

  onUserCommand(cmd: string, output: string) {
    this.pendingUserActions.push(`User ran: ${cmd}\nOutput: ${output}`);
  }

  consumePendingActions(): string | null {
    if (this.pendingUserActions.length === 0) return null;
    const summary = this.pendingUserActions.join('\n---\n');
    this.pendingUserActions = [];
    return summary;
  }
}

// In agent loop
while (!done) {
  const userActions = terminal.consumePendingActions();
  if (userActions) {
    messages.push({
      role: 'user',
      content: `[Terminal session update - user took control]\n${userActions}`
    });
  }

  const response = await generateText({ model, tools, messages });
  // ...
}
```

### Option 4: Diff-Based State Reporting

Track and report only what changed:

```typescript
class TerminalStateTracker {
  private lastKnownState: TerminalState;

  getDiff(): StateDiff | null {
    const current = this.captureState();
    const diff = computeDiff(this.lastKnownState, current);
    if (diff.hasChanges) {
      this.lastKnownState = current;
      return diff;
    }
    return null;
  }
}
```

## Flow Diagram

```
User takes terminal → types `cd /tmp && ls` → output appears
                    ↓
Agent loop detects activity
                    ↓
Injects message: "[User executed in terminal session]
$ cd /tmp && ls
file1.txt  file2.txt
Working directory is now: /tmp"
                    ↓
LLM sees this context on next turn
```

## Existing MCP Implementations

Several MCP servers implement persistent shell sessions:

- **lightos/interactive-shell-mcp** - Interactive shell with node-pty, supports multiple concurrent sessions
- **PiloTY** (github.com/yiwenlu66/PiloTY) - AI pilot for PTY operations, maintains state across commands, supports SSH and background processes
- **pty-mcp-server** (github.com/phoityne/pty-mcp-server) - Haskell-based PTY shell for AI interactions

## User Takeover Implementation

For the "user takes over terminal" feature:

1. Use a shared PTY that both the AI tool and user terminal can access
2. Options for sharing:
   - tmux/screen sessions that user can attach to
   - Web-based terminal UI (xterm.js) connected to same PTY
   - Native terminal multiplexing
3. Monitor PTY for user input (distinct from AI-initiated commands)
4. Buffer and inject user actions into conversation context

## References

- [AI SDK Core: Tool Calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [AI SDK 5 Announcement](https://vercel.com/blog/ai-sdk-5)
- [PiloTY GitHub](https://github.com/yiwenlu66/PiloTY)
- [Interactive Shell MCP](https://lobehub.com/mcp/lightos-interactive-shell-mcp)
