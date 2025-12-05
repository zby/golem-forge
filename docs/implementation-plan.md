# Golem Forge Implementation Plan

## Overview

Build a multi-runtime LLM worker system with TypeScript, starting with CLI and targeting browser extension as the primary deployment.

**Strategic Direction**: CLI first (easier development), Browser Extension is the goal (most powerful reach).

## Related Documents

- **[User Stories](./user-stories.md)** - Requirements and validation criteria
- **[Sandbox Design](./sandbox-design.md)** - Core sandbox abstraction
- **[Browser Extension Architecture](./browser-extension-architecture.md)** - Browser-specific design

## Key Learnings (from design phase)

1. **OPFS is sufficient** for browser storage - no native messaging needed
2. **GitHub as sync layer** bridges browser ↔ local development
3. **Trust levels** are the core security primitive (untrusted → session → workspace → full)
4. **Zone-based permissions** (session/workspace/repo/staged) simplify security reasoning
5. **Unified sandbox interface** with backend-specific implementations

## Porting from Python

Reference for developers familiar with the Python llm-do codebase:

| Python (PydanticAI) | TypeScript (Golem Forge) |
|---------------------|--------------------------|
| Pydantic models | Zod schemas |
| `AbstractToolset` | `Toolset` interface with `getTools()` |
| YAML frontmatter | Same (use `gray-matter`) |
| Jinja2 templates | Nunjucks |
| `dataclass` | TypeScript interfaces/classes |
| `RunContext[T]` | `Session` + `SecurityContext` |
| `pydantic-ai-blocking-approval` | `src/approval/` |
| `pydantic-ai-filesystem-sandbox` | `src/sandbox/` with zone model |

## Approval Callback Examples

The approval system uses runtime-specific callbacks. Each callback receives the security context and must respect trust levels.

### Types

```typescript
interface ApprovalRequest {
  toolName: string;
  toolArgs: Record<string, unknown>;
  description: string;
  securityContext: SecurityContext;  // Includes trust level
}

interface ApprovalDecision {
  approved: boolean;
  note?: string;
  remember: 'none' | 'session';
}

type ApprovalCallback = (request: ApprovalRequest) => Promise<ApprovalDecision>;
```

### CLI Callback

```typescript
const cliApprovalCallback: ApprovalCallback = async (req) => {
  // Show trust level context
  const trustIndicator = {
    untrusted: '⚠️  UNTRUSTED',
    session: '🔓 Session',
    workspace: '📁 Workspace',
    full: '🔑 Full',
  }[req.securityContext.trustLevel];

  console.log(`\n${trustIndicator} | ${req.description}`);
  console.log(`Tool: ${req.toolName}`);
  console.log(`Args: ${JSON.stringify(req.toolArgs, null, 2)}`);

  // Warn on sensitive operations from untrusted context
  if (req.securityContext.trustLevel === 'untrusted') {
    console.log('⚠️  This request originates from untrusted web content');
  }

  const answer = await readline.question('Approve? [y/n/r(emember)] ');

  return {
    approved: answer.toLowerCase().startsWith('y') || answer.toLowerCase() === 'r',
    remember: answer.toLowerCase() === 'r' ? 'session' : 'none',
  };
};
```

### Browser Extension Callback

```typescript
const browserApprovalCallback: ApprovalCallback = async (req) => {
  return new Promise((resolve) => {
    // Send to popup for user decision
    chrome.runtime.sendMessage({
      type: 'approval_request',
      id: crypto.randomUUID(),
      toolName: req.toolName,
      toolArgs: req.toolArgs,
      description: req.description,
      // Security context for UI display
      trustLevel: req.securityContext.trustLevel,
      origin: req.securityContext.origin,
      sessionId: req.securityContext.sessionId,
      // Flag sensitive operations
      isSensitive: req.toolName === 'stage_for_commit' ||
                   req.toolName.startsWith('read_') &&
                   req.securityContext.trustLevel === 'untrusted',
    });

    // Listen for response
    const handler = (msg: any) => {
      if (msg.type === 'approval_response' && msg.requestId === req.id) {
        chrome.runtime.onMessage.removeListener(handler);
        resolve({
          approved: msg.approved,
          remember: msg.remember || 'none',
          note: msg.note,
        });
      }
    };
    chrome.runtime.onMessage.addListener(handler);
  });
};
```

### Test/Mock Callback

```typescript
// Auto-approve for testing (respects security model)
const testApprovalCallback = (policy: 'approve_all' | 'deny_all' | 'approve_safe'): ApprovalCallback => {
  return async (req) => {
    if (policy === 'deny_all') {
      return { approved: false, remember: 'none' };
    }

    if (policy === 'approve_safe') {
      // Only approve if operation is allowed by trust level
      // (simulates a cautious user)
      const dominated = req.securityContext.trustLevel === 'untrusted';
      if (dominated && req.toolName.startsWith('read_')) {
        return { approved: false, remember: 'none', note: 'Blocked read from untrusted' };
      }
    }

    return { approved: true, remember: 'session' };
  };
};
```

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Shared Core                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌───────────────┐  │
│  │  Approval   │  │   Sandbox   │  │   Worker    │  │    Tools      │  │
│  │  System     │  │  Interface  │  │   Runtime   │  │   (Zod)       │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └───────────────┘  │
└─────────────────────────────────────┬───────────────────────────────────┘
                                      │
                    ┌─────────────────┴─────────────────┐
                    │                                   │
                    ▼                                   ▼
          ┌─────────────────┐                ┌─────────────────────┐
          │   CLI Backend   │                │  Browser Backend    │
          │                 │                │                     │
          │  • Node.js fs   │                │  • OPFS             │
          │  • Terminal UI  │                │  • Popup UI         │
          │  • Git CLI      │                │  • Octokit          │
          └─────────────────┘                └─────────────────────┘
```

---

## Phase 1: Foundation (CLI)

**Goal**: Working approval system and sandbox with CLI backend.

### 1.1 Approval System Core
**Stories**: 2.2, 4.2 | **Est. Complexity**: Medium

```
Scope:
- ApprovalResult, ApprovalRequest, ApprovalDecision types
- ApprovalMemory (session cache with deep equality)
- ApprovalController (modes: interactive | approve_all | strict)
- ApprovalCallback type (runtime-agnostic)

Deliverable: src/approval/
Tests: Unit tests with mock callbacks
```

**Success Criteria**:
- [ ] Types compile with strict TypeScript
- [ ] Memory lookup matches on tool name + args
- [ ] Controller modes work correctly
- [ ] Can swap callbacks without touching core

### 1.2 Sandbox Core
**Stories**: 1.1, 1.2, 2.3, 2.4 | **Est. Complexity**: High

```
Scope:
- Sandbox interface (read/write/list/delete/stage)
- Zone enum and permission model
- SecurityContext and trust levels
- Path normalization and escape prevention
- AuditLog interface

Deliverable: src/sandbox/
Tests: Unit tests with MemoryBackend
```

**Success Criteria**:
- [ ] Zone permissions enforced correctly
- [ ] Path traversal attacks blocked
- [ ] Untrusted cannot read repo/workspace
- [ ] All operations logged

### 1.3 CLI Backend
**Stories**: 1.3, 3.2, 7.3 | **Est. Complexity**: Medium

```
Scope:
- CLIBackend implements SandboxBackend
- Maps virtual paths to .sandbox/ directory
- Integrates with real filesystem
- File-based audit log

Deliverable: src/sandbox/backends/cli.ts
Tests: Integration tests with real fs
```

**Success Criteria**:
- [ ] Virtual paths map correctly to filesystem
- [ ] .sandbox/ directory structure created
- [ ] Survives process restart (persistence)

### 1.4 Memory Backend (Testing)
**Stories**: N/A (infrastructure) | **Est. Complexity**: Low

```
Scope:
- MemoryBackend for testing
- Same interface as CLIBackend
- Test helpers for inspection

Deliverable: src/sandbox/backends/memory.ts
Tests: Self-tests
```

### 1.5 Filesystem Tools
**Stories**: 4.1, 4.2 | **Est. Complexity**: Medium

```
Scope:
- read_file, write_file, list_files, delete_file tools
- stage_for_commit tool
- Zod schemas for parameters
- Integration with approval system (needsApproval)

Deliverable: src/tools/filesystem.ts
Tests: Integration tests with sandbox
```

**Success Criteria**:
- [ ] Tools use sandbox interface (not raw fs)
- [ ] Permission errors return LLM-friendly messages
- [ ] Staging creates pending commits

---

## Phase 2: Worker Runtime (CLI)

**Goal**: Execute workers with tools and approval.

### 2.1 Worker Definition Parsing
**Stories**: 4.1 | **Est. Complexity**: Medium

```
Scope:
- Parse .worker YAML files (gray-matter)
- Zod schema for worker config
- Template rendering (Nunjucks)
- file() function for includes

Deliverable: src/worker/parser.ts
Tests: Parse various .worker files
```

### 2.2 Worker Registry
**Stories**: 4.3 | **Est. Complexity**: Medium

```
Scope:
- Scan directories for workers
- Search path support (LLM_DO_PATH)
- Caching parsed definitions
- Alias resolution

Deliverable: src/worker/registry.ts
Tests: Registry loading tests
```

### 2.3 Tool Interception with Approval
**Stories**: 4.2 | **Est. Complexity**: High

```
Scope:
- Wrap Lemmy tool execution
- Route through ApprovalController
- Handle blocked/pre_approved/needs_approval
- Return denial errors to LLM

Deliverable: src/runtime/approval-wrapper.ts
Tests: Mock LLM with tool calls
```

### 2.4 Worker Execution Runtime
**Stories**: 4.1, 4.3 | **Est. Complexity**: High

```
Scope:
- WorkerRuntime class
- Session creation and management
- Tool registration from worker config
- LLM execution via Lemmy

Deliverable: src/runtime/worker.ts
Tests: End-to-end worker execution
```

---

## Phase 3: CLI Application

**Goal**: Usable CLI tool for running workers.

### 3.1 CLI Approval Callback
**Stories**: 4.2 | **Est. Complexity**: Medium

```
Scope:
- Terminal-based approval prompts
- Show tool name, args, description
- y/n/remember options
- Clear formatting

Deliverable: src/cli/approval.ts
Tests: Manual testing
```

### 3.2 CLI Entry Point
**Stories**: Various | **Est. Complexity**: Medium

```
Scope:
- Argument parsing (commander or yargs)
- Worker selection and execution
- Input handling (stdin, file, argument)
- Output formatting

Deliverable: src/cli/index.ts
Tests: CLI integration tests
```

### 3.3 Project Detection
**Stories**: 3.4 | **Est. Complexity**: Low

```
Scope:
- Find project root (.llm-do, package.json, etc.)
- Load project config
- Merge with worker config

Deliverable: src/cli/project.ts
Tests: Various project structures
```

---

## Phase 4: Git Integration (CLI)

**Goal**: Stage and commit workflow for CLI.

### 4.1 Staging System
**Stories**: 1.3, 2.4 | **Est. Complexity**: Medium

```
Scope:
- Stage files to .sandbox/staged/
- StagedCommit metadata
- List/view/discard staged commits

Deliverable: src/sandbox/staging.ts
Tests: Staging workflow tests
```

### 4.2 Git Commit Integration
**Stories**: 1.3 | **Est. Complexity**: Medium

```
Scope:
- Commit staged files to repo
- Use git CLI (simple-git or child_process)
- Handle conflicts

Deliverable: src/cli/git.ts
Tests: Git operation tests
```

---

## Phase 5: Browser Extension

**Goal**: Port core to browser with OPFS backend.

### 5.1 Browser Backend
**Stories**: 1.1, 3.2 | **Est. Complexity**: High

```
Scope:
- BrowserBackend implements SandboxBackend
- OPFS for storage
- IndexedDB for metadata/audit log
- Handle offscreen document for sync operations

Deliverable: src/sandbox/backends/browser.ts
Tests: Browser-based tests (Playwright?)
```

### 5.2 GitHub Sync (Octokit)
**Stories**: 1.3, 3.1, 3.3 | **Est. Complexity**: High

```
Scope:
- GitSync class using Octokit
- Push staged commits to GitHub
- Pull repo content to OPFS
- OAuth flow for authentication

Deliverable: src/browser/git-sync.ts
Tests: Mock Octokit tests
```

### 5.3 Browser Approval UI
**Stories**: 2.1, 4.2 | **Est. Complexity**: Medium

```
Scope:
- Popup component for approvals
- Message passing (service worker ↔ popup)
- Trust level indicator
- Staged commits panel

Deliverable: extension/popup/
Tests: UI tests
```

### 5.4 Extension Scaffold
**Stories**: Various | **Est. Complexity**: Medium

```
Scope:
- Manifest V3 setup
- Service worker
- Content scripts for page analysis
- Build pipeline (esbuild)

Deliverable: extension/
Tests: Extension load tests
```

### 5.5 Content Integration
**Stories**: 5.1, 5.2, 5.3 | **Est. Complexity**: Medium

```
Scope:
- Analyze current page
- Analyze selection
- Fetch and analyze URL
- PDF handling

Deliverable: extension/content/
Tests: Page analysis tests
```

---

## Phase 6: Polish & Features

### 6.1 Worker Delegation
**Stories**: 4.1 | **Est. Complexity**: Medium

```
Scope:
- worker_call tool
- Allowlist enforcement
- Attachment passing
- Nested approval handling
```

### 6.2 Shell Toolset (CLI only)
**Stories**: N/A | **Est. Complexity**: Medium

```
Scope:
- Shell command execution
- Rule-based approval
- Output capture
```

### 6.3 Audit & Reporting
**Stories**: 6.1, 6.2, 6.3 | **Est. Complexity**: Low

```
Scope:
- Audit log viewer
- Security report generation
- Data export
```

---

## Package Structure

```
golem-forge/
├── src/
│   ├── approval/           # Runtime-agnostic approval system
│   │   ├── types.ts
│   │   ├── memory.ts
│   │   └── controller.ts
│   ├── sandbox/            # Unified sandbox
│   │   ├── interface.ts
│   │   ├── zones.ts
│   │   ├── impl.ts
│   │   ├── staging.ts
│   │   └── backends/
│   │       ├── cli.ts
│   │       ├── browser.ts
│   │       └── memory.ts
│   ├── tools/              # Tool definitions
│   │   ├── filesystem.ts
│   │   └── shell.ts        # CLI only
│   ├── worker/             # Worker system
│   │   ├── parser.ts
│   │   ├── registry.ts
│   │   └── types.ts
│   ├── runtime/            # Execution runtime
│   │   ├── worker.ts
│   │   └── approval-wrapper.ts
│   └── cli/                # CLI application
│       ├── index.ts
│       ├── approval.ts
│       └── git.ts
├── extension/              # Browser extension
│   ├── manifest.json
│   ├── service-worker/
│   ├── popup/
│   └── content/
├── tests/
└── docs/
```

---

## MVP Definition

**CLI MVP** = Phase 1-3 complete

Can:
- [x] Run workers with filesystem tools
- [x] Enforce sandbox permissions by trust level
- [x] Interactive approval with memory
- [x] Stage files for commit

Cannot:
- [ ] Push to GitHub (Phase 4)
- [ ] Worker delegation
- [ ] Shell commands
- [ ] Browser execution

**Full MVP** = Phase 1-5 complete

Adds:
- [x] Browser extension with OPFS
- [x] GitHub sync
- [x] Web content analysis

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Sandbox security tests pass | 100% |
| User stories validated | All critical paths |
| Trust level enforcement | No bypasses |
| CLI → Browser code reuse | >80% of core |
| Test coverage | >80% |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| OPFS API limitations | Medium | High | Test early in Phase 5.1 |
| Lemmy API changes | Low | Medium | Pin version, abstract |
| Extension review rejection | Medium | Medium | Follow Manifest V3 best practices |
| GitHub API rate limits | Low | Low | Implement caching, retry |
| Complex merge conflicts | Medium | Medium | Clear conflict UI |

---

## Next Steps

### Immediate (Phase 1)

1. **Set up project structure**
   - TypeScript config
   - Test framework (Vitest)
   - Linting/formatting

2. **Implement 1.1 Approval System**
   - Port types from Python
   - Build memory and controller
   - Test with mock callbacks

3. **Implement 1.2 Sandbox Core**
   - Define interfaces
   - Build zone permission system
   - Test with MemoryBackend

### Validation Gates

After each phase, validate against user stories:

- **Phase 1 Gate**: Stories 2.2, 2.3 (security fundamentals)
- **Phase 2 Gate**: Story 4.1 (worker execution)
- **Phase 3 Gate**: Story 4.2 (approval flow)
- **Phase 4 Gate**: Stories 1.3, 2.4 (staging/commit)
- **Phase 5 Gate**: Stories 1.1, 3.1, 5.1 (browser workflow)

---

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| LLM Framework | Lemmy | Multi-provider, TypeScript native, tool interception |
| Template Engine | Nunjucks | Jinja2 compatible |
| Browser Storage | OPFS | No native messaging needed |
| Remote Sync | GitHub API | Universal, versioned, familiar |
| Build System | tsc + esbuild | tsc for library, esbuild for extension |
| Test Framework | Vitest | Fast, TypeScript native |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2024-XX-XX | Rewritten based on design phase learnings |
| 1.0 | 2024-XX-XX | Initial plan (retired) |
