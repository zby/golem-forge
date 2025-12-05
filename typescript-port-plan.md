# llm-do TypeScript Port Plan

## Overview

Port llm-do to TypeScript using [lemmy](https://github.com/badlogic/lemmy) as the LLM abstraction layer. This plan is structured as a series of experiments, each validating that a core abstraction ports cleanly to TypeScript.

**Key Goal**: The TypeScript port should enable multiple runtimes (CLI, browser extension, VS Code extension, web UI) sharing the same core logic.

### Why Lemmy?

| llm-do Need | Lemmy Provides |
|-------------|----------------|
| Multi-provider LLM support | Unified API for Anthropic, OpenAI, Gemini |
| Approval interception | Manual tool handling with interception points |
| Type-safe tools | Zod schema-based tool definitions |
| CLI infrastructure | @mariozechner/lemmy-tui with rich terminal UI |
| Streaming responses | Built-in streaming with thinking support |

### Key Differences from Python

| Python (PydanticAI) | TypeScript (Lemmy) |
|---------------------|-------------------|
| Pydantic models | Zod schemas |
| `AbstractToolset` | Manual tool arrays with interception |
| YAML frontmatter | Same (use `gray-matter` or similar) |
| Jinja2 templates | Nunjucks or custom template engine |
| `dataclass` | TypeScript interfaces/classes |
| `RunContext[T]` | Typed context passing |

---

## Critical Abstraction: Runtime-Agnostic Approval

The Python `pydantic-ai-blocking-approval` package provides a **runtime-agnostic approval system**. This is essential for multi-runtime support (CLI today, browser extension tomorrow).

### Core Types (must port to TypeScript)

```typescript
// Three-state approval result
type ApprovalStatus = "blocked" | "pre_approved" | "needs_approval";

interface ApprovalResult {
  status: ApprovalStatus;
  blockReason?: string;
}

// What gets sent to the runtime for approval
interface ApprovalRequest {
  toolName: string;
  toolArgs: Record<string, unknown>;
  description: string;  // Human-readable "Execute: git status"
}

// What comes back from the runtime
interface ApprovalDecision {
  approved: boolean;
  note?: string;
  remember: "none" | "session";
}

// THE KEY ABSTRACTION: Runtime callback
type ApprovalCallback = (request: ApprovalRequest) => Promise<ApprovalDecision>;
```

### Why This Matters

```
┌─────────────────────────────────────────────────────┐
│                   llm-do-ts Core                     │
│  ┌───────────┐  ┌───────────┐  ┌───────────────┐   │
│  │  Workers  │  │  Toolsets │  │ ApprovalSystem│   │
│  └───────────┘  └───────────┘  └───────┬───────┘   │
│                                        │            │
│                    ApprovalCallback    │            │
└────────────────────────────────────────┼────────────┘
                                         │
         ┌───────────────────────────────┼───────────────────────────────┐
         │                               │                               │
         ▼                               ▼                               ▼
   ┌───────────┐                  ┌───────────┐                  ┌───────────┐
   │    CLI    │                  │  Browser  │                  │  VS Code  │
   │  Runtime  │                  │ Extension │                  │ Extension │
   │           │                  │           │                  │           │
   │ readline  │                  │ popup.js  │                  │ quickpick │
   │ prompts   │                  │ chrome.*  │                  │ dialogs   │
   └───────────┘                  └───────────┘                  └───────────┘
```

The same core code works across runtimes by injecting different `ApprovalCallback` implementations:

```typescript
// CLI Runtime
const cliCallback: ApprovalCallback = async (req) => {
  const answer = await readline.question(`Approve ${req.description}? [y/n] `);
  return { approved: answer === 'y', remember: 'session' };
};

// Browser Extension Runtime
const browserCallback: ApprovalCallback = async (req) => {
  return new Promise((resolve) => {
    chrome.notifications.create({ /* ... */ });
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'approval_response') {
        resolve({ approved: msg.approved, remember: 'session' });
      }
    });
  });
};

// VS Code Extension Runtime
const vscodeCallback: ApprovalCallback = async (req) => {
  const choice = await vscode.window.showQuickPick(['Approve', 'Deny']);
  return { approved: choice === 'Approve', remember: 'session' };
};
```

### Protocols for Toolsets

Toolsets can implement these interfaces to customize approval behavior:

```typescript
// Toolset decides: blocked/pre_approved/needs_approval
interface SupportsNeedsApproval {
  needsApproval(name: string, args: Record<string, unknown>, ctx: Context): ApprovalResult;
}

// Toolset provides custom description for approval prompt
interface SupportsApprovalDescription {
  getApprovalDescription(name: string, args: Record<string, unknown>, ctx: Context): string;
}
```

---

## Phase 1: Foundation MVP

**Goal**: Validate that lemmy can execute a simple worker with tools and a runtime-agnostic approval system.

### Experiment 1.1: Basic Tool Execution

**Validates**: Lemmy's tool system works for our needs

```
Scope:
- Define a simple tool using Zod schema
- Execute tool through lemmy's unified interface
- Verify tool results feed back to LLM

Success Criteria:
- Tool definition feels natural
- Tool execution works across providers
- Results integrate smoothly with conversation
```

**Deliverable**: `experiments/01-basic-tool/`

### Experiment 1.2: Approval System Core (Runtime-Agnostic)

**Validates**: The approval abstraction works independently of any runtime

This is the **most critical experiment** - it establishes the foundation for multi-runtime support.

```
Scope:
- Port ApprovalResult, ApprovalRequest, ApprovalDecision types
- Port ApprovalMemory (session cache with exact-match lookup)
- Port ApprovalController (mode: interactive | approve_all | strict)
- Create ApprovalCallback type alias
- Test with mock callback (no actual UI)

Key Files to Port:
- pydantic_ai_blocking_approval/types.py → approval/types.ts
- pydantic_ai_blocking_approval/memory.py → approval/memory.ts
- pydantic_ai_blocking_approval/controller.py → approval/controller.ts

Success Criteria:
- Types are clean TypeScript (no `any`)
- Memory lookup works with deep equality on tool_args
- Controller modes work correctly
- Can swap callbacks without touching core code
```

**Deliverable**: `experiments/02-approval-core/` - this becomes a standalone package

### Experiment 1.3: Tool Interception with Approval

**Validates**: Lemmy's manual tool handling integrates with our approval system

```
Scope:
- Wrap lemmy tool execution with approval checking
- Integrate ApprovalController from 1.2
- Handle blocked/pre_approved/needs_approval states
- Return proper errors to LLM on denial

Success Criteria:
- Tool calls route through approval system
- Blocked tools never execute
- Pre-approved tools execute immediately
- Needs-approval tools wait for callback
- Denied tools return useful error to LLM
```

**Deliverable**: `experiments/03-approval-integration/`

### Experiment 1.4: Minimal Worker Definition

**Validates**: YAML worker definitions work in TypeScript

```
Scope:
- Parse .worker file with gray-matter
- Extract frontmatter config + instructions body
- Type the config with Zod schema
- Execute simple instruction through lemmy

Success Criteria:
- Same .worker file format works
- Type validation catches bad configs
- Instructions execute correctly
```

**Deliverable**: `experiments/04-worker-parsing/`

### Experiment 1.5: Multi-Runtime Approval (CLI + Mock Browser)

**Validates**: Same core works with different runtime callbacks

```
Scope:
- Create CLI approval callback (readline-based)
- Create mock browser callback (simulates chrome.* APIs)
- Run same worker with both callbacks
- Verify identical behavior

Success Criteria:
- Both callbacks work with same core code
- No runtime-specific code in core
- Easy to add new runtimes
```

**Deliverable**: `experiments/05-multi-runtime/`

---

## Phase 2: Core Abstractions

**Goal**: Validate the major subsystems port cleanly.

### Experiment 2.1: Sandbox Abstraction

**Validates**: File sandboxing works in Node.js/browser

```
Scope:
- Create FileSandbox class with readable/writable roots
- Implement path resolution with escape prevention
- Build filesystem tools (read, write, list)
- Integrate with approval system from Phase 1

Key Questions:
- Use native fs or library like fs-extra?
- Path resolution: node:path vs custom?
- How to handle symlink escapes?
- Browser: Can we use Origin Private File System (OPFS)?

Browser Considerations:
- Node.js: native fs with path validation
- Browser: File System Access API or virtual fs
- Abstract interface allows both

Success Criteria:
- Cannot escape sandbox boundaries
- LLM-friendly error messages
- Works in Node.js (browser can be stubbed initially)
```

**Deliverable**: `experiments/06-sandbox/`

### Experiment 2.2: Toolset System

**Validates**: Modular toolset loading works

```
Scope:
- Define Toolset interface with approval protocol support
- Implement toolset registry with aliases
- Build filesystem toolset using sandbox
- Dynamic loading from config

Interface Design:
interface Toolset {
  id: string;
  getTools(ctx: Context): Tool[];

  // Optional approval protocol
  needsApproval?(name: string, args: Record<string, unknown>, ctx: Context): ApprovalResult;
  getApprovalDescription?(name: string, args: Record<string, unknown>, ctx: Context): string;
}

Success Criteria:
- Can add/remove toolsets declaratively
- Approval protocol integrates cleanly
- Config types work with worker definitions
```

**Deliverable**: `experiments/07-toolset-system/`

### Experiment 2.3: Worker Context & DI

**Validates**: Dependency injection pattern works

```
Scope:
- Define WorkerContext type
- Pass context through tool execution
- Access sandbox, registry, approval controller from tools

WorkerContext Contents:
interface WorkerContext {
  worker: WorkerDefinition;
  approvalController: ApprovalController;
  registry: WorkerRegistry;
  sandbox?: FileSandbox;
  attachments: Attachment[];
  // ... runtime-specific extensions
}

Success Criteria:
- Tools can access all needed context
- No circular dependency issues
- Clean TypeScript types
```

**Deliverable**: `experiments/08-context-di/`

---

## Phase 3: Worker Lifecycle

**Goal**: Validate worker execution and delegation.

### Experiment 3.1: Worker Registry

**Validates**: Worker loading and caching works

```
Scope:
- Scan directories for .worker files
- Parse and cache definitions
- Handle search paths (LLM_DO_PATH equivalent)
- Jinja2 alternative (Nunjucks/Handlebars/Eta)

Key Questions:
- Nunjucks vs Handlebars vs custom?
- Async loading patterns?
- Watch mode for development?

Browser Considerations:
- Workers could be bundled/embedded in extension
- Or loaded from extension storage
- Registry interface should abstract this

Success Criteria:
- Finds workers in expected locations
- Template rendering works
- file() function equivalent works
```

**Deliverable**: `experiments/09-registry/`

### Experiment 3.2: Worker Delegation

**Validates**: Worker calling worker works

```
Scope:
- worker_call tool implementation
- Allowlist enforcement
- Attachment passing
- Result extraction

Key Questions:
- Recursive context handling?
- Attachment validation in TS?
- How to handle nested approvals?
- Same approval callback propagates to child workers

Success Criteria:
- Parent can call child workers
- Allowlist blocks unauthorized calls
- Attachments transfer correctly
- Child workers use same approval callback as parent
```

**Deliverable**: `experiments/10-delegation/`

### Experiment 3.3: Worker Creation

**Validates**: Dynamic worker creation works

```
Scope:
- worker_create tool
- Persist to generated/ directory (or extension storage)
- Validate definition before saving
- Always require approval

Success Criteria:
- LLM can create new workers
- Definitions validate correctly
- Approval always required
```

**Deliverable**: `experiments/11-worker-creation/`

---

## Phase 4: Shell & Custom Tools

**Goal**: Validate shell execution and custom tool loading.

### Experiment 4.1: Shell Toolset (Node.js only)

**Validates**: Rule-based shell execution works

```
Scope:
- Shell command execution
- Rule matching (patterns, approval requirements)
- Default policy handling
- Streaming output capture

Key Questions:
- child_process vs execa?
- Timeout handling?
- PTY support needed?

Note: Shell toolset is Node.js/CLI only - browser extensions
      won't have shell access (that's fine, different use case)

Success Criteria:
- Commands execute with correct env
- Rules filter as expected
- Output captures properly
```

**Deliverable**: `experiments/12-shell/`

### Experiment 4.2: Custom Tools Loading

**Validates**: Dynamic tool loading from project works

```
Scope:
- Load tools.ts from project directory
- Extract exported functions as tools
- Type-safe schema extraction (Zod)
- Whitelist-based exposure

Key Questions:
- Dynamic import vs require?
- How to extract Zod schemas at runtime?
- Runtime vs compile-time validation?

Browser Considerations:
- Browser: tools could be pre-bundled
- Or loaded via importScripts in service worker
- Interface should support both patterns

Success Criteria:
- Functions become tools
- Type safety preserved
- Private functions excluded
```

**Deliverable**: `experiments/13-custom-tools/`

---

## Phase 5: CLI & Integration

**Goal**: Build production CLI using lemmy-tui.

### Experiment 5.1: CLI Foundation

**Validates**: lemmy-tui works for our needs

```
Scope:
- Basic CLI with argument parsing
- CLI-specific ApprovalCallback implementation
- Streaming response display
- Rich formatting (markdown, code)

Key Questions:
- commander vs yargs vs custom?
- How does lemmy-tui rendering work?
- Color/styling system?

Success Criteria:
- Clean CLI experience
- Approval prompts work (using callback from Phase 1)
- Output looks good
```

**Deliverable**: `experiments/14-cli/`

### Experiment 5.2: Project Detection

**Validates**: Project resolution works

```
Scope:
- Detect project directory
- Single-file mode
- Search path mode
- Config merging (project.yaml + worker)

Success Criteria:
- All three modes work
- Config precedence correct
- Error messages helpful
```

**Deliverable**: `experiments/15-project-detection/`

### Experiment 5.3: End-to-End Integration

**Validates**: Full system works together

```
Scope:
- Run existing Python .worker files
- Full toolset integration
- All approval flows
- Multi-worker delegation

Success Criteria:
- Python workers run unchanged
- Behavior matches Python version
- Performance acceptable
```

**Deliverable**: `experiments/16-e2e/`

---

## Phase 6: Browser Extension Prototype

**Goal**: Validate the multi-runtime architecture with a real browser extension.

### Experiment 6.1: Extension Scaffold

**Validates**: Core can run in browser context

```
Scope:
- Chrome Manifest V3 extension scaffold
- Service worker for LLM calls
- Popup UI for approval prompts
- Import llm-do-ts core (bundled)

Key Questions:
- How to bundle for extension?
- CORS handling for LLM APIs?
- Storage for workers/config?

Success Criteria:
- Extension loads without errors
- Can make LLM API calls from service worker
```

**Deliverable**: `experiments/17-extension-scaffold/`

### Experiment 6.2: Browser ApprovalCallback

**Validates**: Approval UI works in extension popup

```
Scope:
- Popup component for approval requests
- Message passing: service worker ↔ popup
- Queue for pending approvals
- Session memory in extension storage

Success Criteria:
- Tool calls trigger popup
- User can approve/deny
- Session remembering works
```

**Deliverable**: `experiments/18-browser-approval/`

### Experiment 6.3: Browser-Specific Toolsets

**Validates**: Extension-specific tools work

```
Scope:
- Tab manipulation tools (open, close, read content)
- Clipboard tools
- Screenshot tools
- Bookmark/history tools

Success Criteria:
- Tools use chrome.* APIs
- Proper permission handling
- Approval integrates correctly
```

**Deliverable**: `experiments/19-browser-tools/`

---

## Phase 7: Feature Parity

**Goal**: Achieve full feature parity with Python version.

### 7.1: Server-Side Tools
- Web search, code execution, web fetch
- Provider-specific configuration
- Usage limits

### 7.2: Model Compatibility
- Wildcard pattern matching
- Validation at delegation time
- Error messages

### 7.3: Attachment System
- AttachmentPolicy type
- Size/count/suffix limits
- Payload transfer

### 7.4: Output Schemas
- Structured output validation
- Zod-based schemas
- Optional per-worker schemas

---

## Architecture Decisions to Make

### Decision 1: Package Structure

```
Option A: Monorepo with separate packages
  packages/
    approval/       # Runtime-agnostic approval (standalone, reusable)
    core/           # Types, registry, runtime
    sandbox/        # File sandboxing
    toolsets/       # Built-in toolsets
    cli/            # CLI application
    browser-ext/    # Browser extension

Option B: Single Package + Extension
  src/
    approval/       # Exported for extension reuse
    core/
    sandbox/
    toolsets/
    cli/
  extension/        # Separate build
```

**Recommendation**: Option A - approval system should be a **standalone package** that can be:
- Used by llm-do-ts core
- Used directly by browser extension
- Used by other projects (VS Code extension, etc.)

### Decision 2: Approval Package Scope

```
Option A: Minimal (types + memory + controller only)
  - ApprovalResult, ApprovalRequest, ApprovalDecision
  - ApprovalMemory (session cache)
  - ApprovalController (mode handling)
  - No UI, no LLM integration

Option B: With Toolset Wrapper
  - Everything from A
  - ApprovalToolset wrapper (generic over LLM framework)
```

**Recommendation**: Option A initially. Keep it minimal and framework-agnostic.
The toolset wrapper can live in the core package since it's specific to lemmy.

### Decision 3: Template Engine

```
Option A: Nunjucks (closest to Jinja2)
Option B: Handlebars (simpler, widely used)
Option C: Custom (minimal, tailored)
```

**Recommendation**: Nunjucks for Jinja2 compatibility.

### Decision 4: Build System

```
Option A: tsc only (simple, lemmy uses this)
Option B: esbuild/swc (faster)
Option C: tsup (library-focused)
```

**Recommendation**: tsc for core, esbuild for browser extension bundling.

### Decision 5: Runtime Targets

```
Option A: Node.js CLI only (Phase 1-5)
Option B: Node.js + Browser from start
```

**Recommendation**: Start with Node.js, but design interfaces for browser compatibility from day 1.
The approval callback abstraction makes this natural.

---

## MVP Definition

**Minimum Viable Product** = Experiments 1.1 → 3.2 (Phases 1-3)

MVP can:
- Parse and execute .worker files
- Provide filesystem tools with sandbox
- Handle approvals interactively via **runtime-agnostic callback**
- Delegate to other workers
- Run via CLI
- **Same core works with different approval UIs**

MVP cannot:
- Create workers dynamically
- Execute shell commands
- Load custom tools from tools.ts
- Handle server-side tools
- Run in browser (but architecture supports it)

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Existing .worker files run unchanged | 100% |
| Tool execution parity | 100% |
| Performance (simple worker) | <2x Python |
| Type coverage | 100% |
| Test coverage | >80% |

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Lemmy API changes | Pin version, contribute upstream |
| Template engine differences | Compatibility layer for file() |
| Path handling edge cases | Comprehensive test suite |
| Dynamic import complexity | Fallback to require() |
| TUI limitations | Fallback to simpler prompts |

---

## Next Steps

### Immediate (Experiment 1.1-1.2)

1. **Clone lemmy** and explore API surface
   - Understand tool definition patterns
   - Understand manual tool handling / interception
   - Identify how to wrap tool execution

2. **Run Experiment 1.1** - Basic tool execution
   - Simple Zod-defined tool
   - Execute via lemmy
   - Verify cross-provider

3. **Run Experiment 1.2** - Approval system core (CRITICAL)
   - Port types.ts, memory.ts, controller.ts
   - Test without UI (mock callback)
   - This is the **foundation for everything**

### After MVP Validation

4. **Experiment 1.5** - Multi-runtime test
   - Prove same code works with CLI and mock browser callbacks
   - This validates the architecture before heavy investment

5. If 1.5 works → proceed to Phase 2-5
6. If 1.5 fails → revisit abstractions

### Experiment Guidelines

Each experiment should:
- Be self-contained in `experiments/NN-name/`
- Have clear success criteria (documented in README)
- Document discoveries and blockers
- Include runnable examples
- Have tests where applicable

### Key Questions to Answer Early

1. Does lemmy's tool interception point give us what we need for approvals?
2. Can the approval system be truly runtime-agnostic (no node-specific code)?
3. What's the minimal surface area for the approval package?
4. How does lemmy handle tool execution errors - can we return useful info to LLM?
