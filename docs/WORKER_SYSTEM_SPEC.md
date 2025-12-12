# Worker System Functional Specification

This document describes the functional requirements for the golem-forge worker system. It is intended to guide implementations across different SDKs while preserving core capabilities.

---

## 1. Core Concepts

### 1.1 Worker

A **worker** is a configured LLM agent with:

- A **name** (unique identifier)
- **Instructions** (system prompt defining behavior)
- A set of **tools** it can invoke
- Optional **constraints** (allowed models, sandbox restrictions)

Workers are the fundamental execution unit. They receive input, process it using LLM reasoning and tool calls, and produce output.

### 1.2 Program

A **program** is a collection of workers that share:

- A common **sandbox** (isolated file system)
- Configuration defaults (model, approval mode)
- Worker discovery paths

Programs define the execution boundary and resource sharing model.

### 1.3 Toolset

A **toolset** is a named collection of tools that can be attached to workers. Toolsets are pluggable and provide capabilities like file operations, worker delegation, or custom domain logic.

---

## 2. Worker-to-Worker Communication

### 2.1 Delegation Model

Workers MUST be able to invoke other workers as tools. This enables:

- **Task decomposition**: Complex tasks split across specialized workers
- **Separation of concerns**: Each worker has focused capabilities
- **Reusability**: Common workers shared across programs

### 2.2 Delegation Requirements

| Requirement | Description |
|-------------|-------------|
| **Explicit allowlist** | A worker MUST declare which other workers it can call |
| **Depth limiting** | Maximum delegation depth MUST be configurable to prevent infinite recursion |
| **Circular detection** | The system SHOULD detect and prevent circular delegation chains |
| **Context passing** | Delegating worker CAN pass additional instructions and file attachments to child workers |
| **Sandbox inheritance** | Child workers inherit (and can further restrict) the parent's sandbox |

### 2.3 Delegation Interface

When invoking another worker, the caller provides:

```
input: string          # The task/question for the child worker
instructions?: string  # Optional additional guidance
attachments?: string[] # Optional file paths (within sandbox) to include
```

The child worker executes independently and returns its result to the parent.

---

## 3. Tool System

### 3.1 Tool Definition

A tool is a callable function exposed to the LLM with:

| Property | Required | Description |
|----------|----------|-------------|
| `name` | Yes | Unique identifier |
| `description` | Yes | Human-readable description (shown to LLM) |
| `inputSchema` | Yes | Schema defining expected arguments |
| `execute` | Yes | The function to invoke |
| `needsApproval` | No | Whether tool requires user approval (see §4) |

### 3.2 Easy Function Wrapping

The system MUST provide a simple way to convert existing functions into tools.

**Minimal wrapping**: A plain function with a companion schema should be convertible to a tool:

```
function greet(args: { name: string }): string {
  return `Hello, ${args.name}!`;
}

// Schema can be co-located or inferred
greetSchema = { name: z.string() }
```

**Full control**: For advanced cases, users can define complete tool objects with custom approval logic, descriptions, etc.

### 3.3 Toolset Plugin Architecture

Toolsets MUST be pluggable:

- **Registration**: Toolsets register under a name (e.g., "filesystem", "workers", "custom")
- **Factory pattern**: Toolset factories receive context (sandbox, approval controller, etc.) and return tool instances
- **Configuration**: Workers reference toolsets by name and can pass toolset-specific configuration

**Built-in toolsets**:

| Toolset | Purpose |
|---------|---------|
| `filesystem` | Sandboxed file read/write/list/delete |
| `workers` | Invoke other workers (delegation) |
| `custom` | Load user-defined tools from module |

### 3.4 Custom Tool Loading

The `custom` toolset MUST support:

- Loading tools from a specified module path
- Selecting specific exports to expose as tools
- Applying approval policies per-tool

---

## 4. Approval System

### 4.1 Purpose

Some tool operations are sensitive (file writes, external calls, destructive actions). The approval system provides human oversight before these execute.

### 4.2 Approval Modes

The system MUST support these approval modes:

| Mode | Behavior |
|------|----------|
| `interactive` | Prompt user and wait for decision |
| `approve_all` | Auto-approve all requests (for testing) |
| `auto_deny` | Auto-deny all requests (for CI/safety) |

### 4.3 Tool Approval Configuration

Tools can be configured with approval requirements:

| Setting | Behavior |
|---------|----------|
| `preApproved` | Never prompt, always execute |
| `ask` | Always prompt user |
| `blocked` | Never execute, always deny |

### 4.4 Approval Request

When a tool requires approval, the system presents:

- Tool name
- Arguments being passed
- Optional description/context

User responds with: approve / deny / remember

### 4.5 Session Memory

If user chooses "remember", the decision SHOULD be cached for the session:

- Same tool + same arguments = use cached decision
- Reduces approval fatigue for repeated operations
- Memory is scoped to session (not persisted)

### 4.6 Approval Propagation

When workers delegate to other workers:

- The approval controller MUST be shared across the delegation chain
- Child workers respect the same approval mode as the parent
- Session memory is visible to all workers in the chain

---

## 5. Sandbox System

### 5.1 Purpose

The sandbox provides:

- **Isolation**: Workers operate within a confined file system
- **Security**: Prevents access outside designated boundaries
- **Portability**: Same worker definitions work across environments

### 5.2 Mount Model

Sandboxes use a mount-based model (similar to Docker):

- A **root** directory maps to `/` in the sandbox
- All worker file operations use **virtual paths** (starting with `/`)
- The sandbox translates virtual paths to real filesystem locations

### 5.3 Sandbox Operations

The sandbox MUST provide these operations:

| Operation | Description |
|-----------|-------------|
| `read(path)` | Read file contents as text |
| `readBinary(path)` | Read file contents as bytes |
| `write(path, content)` | Write text to file |
| `writeBinary(path, content)` | Write bytes to file |
| `delete(path)` | Remove file |
| `exists(path)` | Check if path exists |
| `list(path)` | List directory contents |
| `stat(path)` | Get file metadata |

### 5.4 Sandbox Restrictions

Workers CAN declare sandbox restrictions:

| Restriction | Effect |
|-------------|--------|
| `restrict: /path` | Worker only sees files under `/path` |
| `readonly: true` | Worker cannot write/delete files |

Restrictions are **additive**: child workers can only further restrict, never relax.

### 5.5 Platform Abstraction

The sandbox interface MUST be platform-agnostic:

- CLI: Implemented via Node.js filesystem
- Browser: Implemented via Origin Private File System (OPFS) or similar
- Same worker definitions work on both platforms

---

## 6. Worker Definition Format

### 6.1 Structure

Workers are defined with:

1. **Metadata** (name, description, toolsets, constraints)
2. **Instructions** (the prompt body)

The specific serialization format (YAML, JSON, code) is implementation-defined.

### 6.2 Required Fields

| Field | Description |
|-------|-------------|
| `name` | Unique worker identifier |
| `instructions` | System prompt defining worker behavior |

### 6.3 Optional Fields

| Field | Description |
|-------|-------------|
| `description` | Human-readable description |
| `toolsets` | Map of toolset configurations |
| `sandbox` | Worker-level sandbox restrictions |
| `compatible_models` | Model constraints (e.g., only Anthropic models) |
| `mode` | Execution mode: `single` (one response) or `chat` (multi-turn) |

---

## 7. Program Configuration

### 7.1 Program-Level Settings

Programs CAN define defaults that apply to all workers:

| Setting | Description |
|---------|-------------|
| `model` | Default model for workers |
| `sandbox.root` | Root directory for sandbox mount |
| `sandbox.readonly` | Default read-only mode |
| `approval.mode` | Default approval mode |
| `delegation.maxDepth` | Maximum worker delegation depth |
| `workerPaths` | Search paths for worker discovery |

### 7.2 Configuration Precedence

Settings are resolved in order (first wins):

1. Runtime/CLI arguments
2. Environment variables
3. Program configuration file
4. System defaults

---

## 8. Execution Model

### 8.1 Single-Shot Mode

Default execution mode:

1. Worker receives input
2. Worker processes (may make tool calls, including delegating to other workers)
3. Worker returns final response
4. Execution ends

### 8.2 Chat Mode

Multi-turn conversation:

1. Worker receives input
2. Worker responds
3. User provides follow-up
4. Repeat until session ends

Chat mode SHOULD support context limits (max tokens) to manage conversation length.

### 8.3 Delegation Execution

When worker A delegates to worker B:

1. A invokes B as a tool call
2. B executes completely (single-shot or limited chat)
3. B's result returns to A
4. A continues processing with B's result

---

## 9. Error Handling

### 9.1 Tool Errors

When a tool execution fails:

- Error is returned to the LLM
- LLM can retry, use alternative approach, or report failure
- Errors do NOT automatically terminate the worker

### 9.2 Approval Denial

When user denies a tool call:

- Denial is reported to the LLM as an error
- LLM can adjust approach or inform user

### 9.3 Delegation Failures

When a child worker fails:

- Error propagates to parent worker
- Parent can handle or propagate further

---

## 10. Non-Goals

This specification explicitly does NOT cover:

- **Specific serialization formats** (YAML vs JSON vs code)
- **LLM provider interfaces** (how to call different models)
- **Persistence** (conversation history, approval persistence beyond session)
- **Authentication/authorization** (beyond sandbox restrictions)
- **Streaming** (implementation detail)
- **Specific tool implementations** (file operations, git, etc.)

These are implementation concerns that may vary across SDKs.

---

## Appendix A: Example Worker Configurations

### A.1 Simple Worker

```yaml
name: greeter
instructions: |
  You are a friendly greeter. When given a name, respond with a warm greeting.
```

### A.2 Worker with Custom Tools

```yaml
name: calculator
toolsets:
  custom:
    module: "./math-tools"
    tools: [add, subtract, multiply, divide]
    approval:
      default: preApproved
instructions: |
  You are a calculator. Use the math tools to compute results.
```

### A.3 Orchestrator Worker

```yaml
name: orchestrator
toolsets:
  workers:
    allowed_workers: [analyzer, formatter, validator]
  filesystem:
    approval:
      default: ask
      tools:
        read_file: preApproved
instructions: |
  You coordinate complex tasks by delegating to specialized workers.

  Available workers:
  - analyzer: Analyzes code for issues
  - formatter: Formats code according to style guides
  - validator: Validates output correctness
```

### A.4 Restricted Worker

```yaml
name: code-reviewer
sandbox:
  restrict: /src
  readonly: true
toolsets:
  filesystem: {}
instructions: |
  You review code in /src. You can read files but not modify them.
```

---

## Appendix B: Approval Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Tool Call Initiated                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │  Check needsApproval  │
                  └───────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
        needsApproval                  needsApproval
           = false                        = true
              │                               │
              │                               ▼
              │                   ┌───────────────────────┐
              │                   │  Check session cache  │
              │                   └───────────────────────┘
              │                               │
              │               ┌───────────────┴───────────────┐
              │               │                               │
              │               ▼                               ▼
              │          Cache hit                       Cache miss
              │               │                               │
              │               ▼                               ▼
              │        Use cached                    ┌─────────────────┐
              │         decision                     │  Check approval │
              │               │                      │      mode       │
              │               │                      └─────────────────┘
              │               │                               │
              │               │           ┌───────────────────┼───────────────────┐
              │               │           │                   │                   │
              │               │           ▼                   ▼                   ▼
              │               │      interactive         approve_all         auto_deny
              │               │           │                   │                   │
              │               │           ▼                   │                   │
              │               │    ┌─────────────┐            │                   │
              │               │    │ Prompt user │            │                   │
              │               │    └─────────────┘            │                   │
              │               │           │                   │                   │
              │               │     ┌─────┴─────┐             │                   │
              │               │     │           │             │                   │
              │               │     ▼           ▼             ▼                   ▼
              │               │  Approve      Deny         Approve              Deny
              │               │     │           │             │                   │
              │               │     │           │             │                   │
              ▼               ▼     ▼           ▼             ▼                   ▼
        ┌───────────────────────────────────────────────────────────────────────────┐
        │                          Execute or Return Error                          │
        └───────────────────────────────────────────────────────────────────────────┘
```

---

## Appendix C: Delegation Chain Example

```
User Input: "Analyze and fix the bugs in /src"
                    │
                    ▼
         ┌──────────────────┐
         │   Orchestrator   │  (depth=0)
         │   Worker         │
         └──────────────────┘
                    │
        ┌───────────┴───────────┐
        │                       │
        ▼                       ▼
┌──────────────┐        ┌──────────────┐
│   Analyzer   │        │   Fixer      │  (depth=1)
│   Worker     │        │   Worker     │
└──────────────┘        └──────────────┘
        │
        ▼
┌──────────────┐
│  Type Check  │  (depth=2)
│   Worker     │
└──────────────┘

- Each worker has access to the shared sandbox
- Child workers inherit parent's sandbox restrictions
- All share the same ApprovalController
- Delegation depth tracked to prevent runaway recursion
```
