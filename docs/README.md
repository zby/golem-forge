# Golem Forge Documentation

## Package Structure

golem-forge is organized as a monorepo with four packages:

| Package | Description |
|---------|-------------|
| [`@golem-forge/core`](../packages/core/) | Runtime engine, tools, approval system, AI SDK integration |
| [`@golem-forge/ui-react`](../packages/ui-react/) | React-based UI state management |
| [`@golem-forge/cli`](../packages/cli/) | CLI tool with Node.js adapters |
| [`@golem-forge/chrome`](../packages/chrome/) | Chrome extension with browser adapters |

---

## Strategic Direction

**Start with CLI, build toward Browser Extension.**

| Phase | Runtime | Why |
|-------|---------|-----|
| **Now** | CLI (Node.js) | Easier to test, debug, iterate. Full filesystem access. Faster development cycle. |
| **Next** | Browser Extension | Most powerful deployment. Reaches users where they work. Web content integration. |

The CLI is the **proving ground** - we validate the core abstractions (sandbox, approval, workers) in an environment where debugging is straightforward. Once stable, the same core runs in the browser with a different backend.

```
                       @golem-forge/core
        ┌───────────────────────────────────────────────┐
        │  • WorkerRuntime (AI SDK integration)         │
        │  • ToolsetRegistry & portable toolsets        │
        │  • ApprovalController & ApprovalMemory        │
        │  • UIEventBus & RuntimeUI                     │
        │  • Worker schema & parser                     │
        │  • IsomorphicGitBackend                       │
        └──────────────────────┬────────────────────────┘
                               │
           ┌───────────────────┴───────────────────┐
           │                                       │
           ▼                                       ▼
    ┌─────────────────────┐            ┌─────────────────────────┐
    │  @golem-forge/cli   │            │  @golem-forge/chrome    │
    │                     │            │                         │
    │  Adapters:          │            │  Adapters:              │
    │  • MountSandbox     │            │  • OPFS Sandbox         │
    │  • File registry    │            │  • Bundled registry     │
    │  • CLIGitBackend    │            │  • IsomorphicGit+OPFS   │
    │  • ShellToolset     │            │  • React/Web UI         │
    │  • Ink terminal UI  │            │                         │
    └─────────────────────┘            └─────────────────────────┘
```

### Why Browser Extension is the Goal

1. **Reach**: Users are already in the browser researching, reading PDFs, browsing documentation
2. **Context**: Can analyze the current page, selected text, linked documents
3. **Zero Install**: No Node.js, no CLI setup - just install the extension
4. **Integration**: Direct access to web APIs, GitHub OAuth, cloud services
5. **Cross-Platform**: Works on any OS with Chrome/Firefox

### Why CLI Comes First

1. **Debuggability**: `console.log`, breakpoints, stack traces all work normally
2. **Testing**: Easy to write integration tests with real filesystem
3. **Iteration Speed**: No browser reload, no extension repacking
4. **Validation**: Prove the abstractions work before adding browser complexity
5. **Fallback**: Power users may prefer CLI anyway

---

## Document Index

### Requirements
- **[User Stories](./user-stories.md)** - What we're building and why. Validation criteria.

### Use Cases
- **[Pitch Deck Analyzer](./use-cases/pitchdeck-analyzer.md)** - First practical tool: process pitch decks from Hey email
- **[Browser Program Management](./use-cases/browser-project-management.md)** - Programs, workers, and GitHub integration in the browser extension

### Architecture
- **[Sandbox Design](./sandbox-design.md)** - Unified sandbox for CLI and browser. Core security model.
- **[Tools and UI](./tools-and-ui.md)** - Tool definition, approval system, execution modes, UI abstraction.
- **[Git Toolset](./git-toolset.md)** - Git operations with staged commits and approval gates.
- **[Browser Extension Architecture](./browser-extension-architecture.md)** - Browser-specific architecture, OPFS, GitHub sync.

### Implementation Plan
- **[Implementation Plan](./implementation-plan.md)** - Phased approach with validation gates

---

## Reading Order

1. **User Stories** - Understand what we're building
2. **Sandbox Design** - Understand the core abstraction
3. **Tools and UI** - Understand tools, approval, and UI layer
4. **Browser Extension Architecture** - Understand the browser-specific layer
5. **Implementation Plan** - Understand the build sequence

---

## Key Concepts

### Trust Levels
```
untrusted → session → workspace → full
    │           │          │         │
    │           │          │         └── CLI default, full access
    │           │          └──────────── Can read repo
    │           └─────────────────────── User-initiated, no repo read
    └─────────────────────────────────── Web content, isolated sandbox
```

### Zones
```
/session/    - Ephemeral per-session workspace
/workspace/  - Persistent cache and data
/repo/       - Git repository content (protected)
/staged/     - Files pending commit (review required)
/workers/    - Worker definitions (read-only)
```

### Security Principle

> **Untrusted content can write freely to its sandbox, but cannot read anything valuable to exfiltrate.**

This single principle drives most security decisions. Prompt injection from web content can generate garbage output, but cannot steal existing data.
