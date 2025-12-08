# Browser Extension Implementation Plan

**Status:** Phase 1 Complete, Phase 2-3 Next
**Based on:** [Browser Extension Architecture](../browser-extension-architecture.md), [Sandbox Design](../sandbox-design.md)
**Implementation:** `packages/browser/`

This plan outlines the steps to build the Golem Forge browser extension, focusing on the "Project" based workflow and GitHub integration.

## Phase 0: Validation ✅ COMPLETE

**Goal:** Validate key technical assumptions before full implementation.

### 0.1 AI SDK Browser Compatibility ✅

**Status:** Validated successfully. See [AI SDK Browser Lessons](./ai-sdk-browser-lessons.md).

Key validations:
- [x] `streamText()` works from extension sidepanel
- [x] `host_permissions` bypasses CORS for LLM APIs
- [x] Bundle size is acceptable (~140KB gzipped including React)
- [x] No Node.js polyfills required

**Architecture Decision:** The browser extension uses **user-provided API keys** with direct LLM API calls (no backend proxy required).

## Phase 1: Core Foundation ✅ COMPLETE

**Goal:** Establish the storage structure (OPFS), worker management, and sandbox.

### 1.1 Project & Worker Storage ✅

- [x] Implement `ProjectManager` service (`services/project-manager.ts`)
  - [x] CRUD operations for Projects in `chrome.storage.local`
  - [x] OPFS cleanup on project deletion
- [x] Define data models (`storage/types.ts`)

### 1.2 Worker Management ✅

- [x] Create `WorkerManager` for browser (`services/worker-manager.ts`)
- [x] Implement bundled worker loading (from extension bundle)
- [x] Custom YAML parser for worker definitions
- [ ] ~~Implement GitHub worker syncing~~ (moved to Phase 2)

### 1.3 OPFS Sandbox ✅

- [x] Implement `OPFSSandbox` (`services/opfs-sandbox.ts`)
  - [x] `read(path)`, `write(path, content)`, `list(path)`, `delete(path)`
  - [x] `resolve(path)` - map virtual paths to OPFS paths
  - [x] Mount configuration with readonly mode enforcement
  - [x] Path boundary validation (no escape via `..`)

### 1.4 Basic Worker Runtime ✅

- [x] Implement `BrowserRuntime` (`services/browser-runtime.ts`)
  - [x] `streamText()` for real-time responses
  - [x] AI SDK v6 property names (`textDelta`, `args`)
- [x] Implement `AIService` (`services/ai-service.ts`)
  - [x] `createAnthropic()` with `anthropic-dangerous-direct-browser-access` header
  - [x] `createOpenAI()` with `dangerouslyAllowBrowser: true`
  - [x] Provider validation
- [x] Implement API key management
  - [x] Settings UI for entering API keys per provider (`sidepanel.tsx`)
  - [x] Secure storage in `chrome.storage.local` (`storage/settings-manager.ts`)
  - [x] Masked key display with edit tracking
- [x] Configure Vite build for extension (`vite.config.ts`)
  - [x] Flattened output structure for manifest paths
- [x] Implement tool execution for browser
  - [x] File tools using OPFS sandbox

### 1.5 UI Foundation ✅

- [x] Extension popup (`popup.tsx`)
- [x] Side panel with settings tab (`sidepanel.tsx`)
- [x] Message display with unique IDs
- [x] Settings navigation from popup

## Phase 2: GitHub Integration

**Goal:** Enable synchronization between OPFS projects and GitHub repositories.

### 2.1 Authentication

- [ ] Implement GitHub OAuth flow (`identity` permission)
- [ ] Secure token storage
  - [ ] Use `chrome.storage.session` for ephemeral storage
  - [ ] Encrypted `chrome.storage.local` for persistence
- [ ] Token refresh handling

### 2.2 Octokit Integration

- [ ] Integrate `@octokit/rest` (or lightweight alternative)
- [ ] Implement `GitSync` service
  - [ ] `pull()`: Fetch repo content → write to OPFS `/projects/{id}/cache`
  - [ ] `push()`: Read from OPFS `/staged` → create commit → push
  - [ ] Handle merge conflicts gracefully

### 2.3 Staging & Clearance

Implement the clearance protocol for browser (see [Sandbox Design](../sandbox-design.md#clearance-protocol)).

- [ ] Implement `stageFiles(files)` in `GitSync`
  - [ ] Read files from sandbox using `sandbox.read(path)`
  - [ ] Write to `/staged/{commit-id}/` staging area
  - [ ] Generate `manifest.json` for the commit
- [ ] Implement staging status API for UI
- [ ] Push remains user-initiated (clearance boundary)

### 2.4 GitHub Worker Sources

- [ ] Implement GitHub worker syncing in `WorkerManager`
- [ ] Fetch and cache worker definitions in OPFS
- [ ] HTTP-style cache invalidation

## Phase 3: UI & Triggers

**Goal:** User-facing interface for managing projects and triggering workers from websites.

### 3.1 Extension Popup / Options

- [ ] **Project Dashboard**: List projects, create new (link to repo)
- [ ] **Worker Settings**: Enable/disable workers per project, manage sources
- [ ] **Clearance View**: Show pending staged commits
  - [ ] Display diffs
  - [ ] Approve/Reject buttons (triggers manual `git_push`)

### 3.2 Content Script Triggers

- [ ] Implement `SiteTrigger` matching logic in Background script
- [ ] Create generic Content Script
  - [ ] Listen for URL pattern matches
  - [ ] Inject "Action Button" (e.g., "Analyze Pitch Deck")
  - [ ] Handle click → Send message to Background to start Session
- [ ] Trust level assignment based on trigger type

### 3.3 Approval & Clearance UI

- [ ] Implement tool approval dialog
  - [ ] Show tool name, arguments, risk level
  - [ ] Remember decisions option
- [ ] Implement clearance notification
  - [ ] Badge count for pending items
  - [ ] Quick access to clearance view
- [ ] System message display when user clears/discards items

## Phase 4: Advanced Security (Future)

**Goal:** Harden isolation for untrusted content.

### 4.1 WASM Runtime

See [Container Isolation Options](./container-isolation-options.md) for research.

- [ ] Research WASI runtimes for browser (e.g., `browser_wasi_shim`)
- [ ] Compile core tools to WASM (grep, text processing)
- [ ] Update `WorkerRuntime` to execute tools in WASM sandbox
- [ ] Capability-based filesystem access within WASM

### 4.2 Advanced Permissions

- [ ] Fine-grained permission UI (e.g., "Allow network access to *.google.com")
- [ ] Audit log viewer
- [ ] Scanner integration for binary content

## Known Issues / Tech Debt

From `REVIEW-NOTES.md`:

| Issue | Priority | Status |
|-------|----------|--------|
| Custom YAML parser (~140 lines) | Low | Works correctly |
| Unused mount system features | Low | May be needed later |
| Inline styles (~250 lines) | Low | Cosmetic |
| No icon PNGs | Low | Cosmetic |

## Architecture Notes

### What's Shared Between CLI and Browser

| Component | Shared? | Notes |
|-----------|---------|-------|
| `WorkerDefinition` schema | ✓ | Core data model |
| `parseWorkerString()` | ✓ | Parser is pure JS |
| `WorkerRuntime` logic | Partial | Core loop shared, tools differ |
| `MountSandbox` interface | ✓ | Same API: `read`, `write`, `resolve`, `restrict` |
| `FileOperations` interface | ✓ | Common file ops abstraction |
| Clearance protocol | ✓ | Same design |
| `WorkerRegistry` | ✗ | CLI-only, uses Node.js fs |
| `MountSandboxImpl` | ✗ | Node fs vs OPFS backends |
| Tool implementations | ✗ | Platform-specific |

### Why Not a Shared WorkerRegistry Interface?

The CLI's `WorkerRegistry` does filesystem-heavy operations:
- Directory scanning with `readdir`
- File modification time (`mtime`) caching
- `process.env.LLM_DO_PATH` configuration
- Recursive path resolution

A browser "registry" would do none of these. It would:
1. Load bundled workers from extension assets
2. Fetch worker definitions from GitHub API
3. Cache in OPFS with HTTP-style invalidation

These are fundamentally different operations that happen to have the same *output* (a `WorkerDefinition`). Creating an abstract interface would:
- Force awkward method signatures that fit neither use case well
- Add complexity without enabling code reuse
- Couple browser to CLI implementation details

**Better approach:** Share the output type (`WorkerDefinition`) and parser, let each platform manage discovery its own way.

## Milestones

| Milestone | Deliverable | Status |
|-----------|-------------|--------|
| **M1: MVP Core** | Project creation, OPFS storage, local worker execution | ✅ Complete |
| **M2: Sync** | GitHub Auth, Pull/Push, Staging UI | Not started |
| **M3: Integration** | Hey.com Pitch Deck Analyzer demo (End-to-End) | Not started |
| **M4: Security** | WASM isolation, audit logging | Not started |

## Related Documents

- [Browser Extension Architecture](../browser-extension-architecture.md) - System architecture
- [Sandbox Design](../sandbox-design.md) - Zone model and clearance protocol
- [AI SDK Browser Lessons](./ai-sdk-browser-lessons.md) - Lessons learned from validation
- [Container Isolation Options](./container-isolation-options.md) - WASM and other isolation strategies
- [Browser Package README](../../packages/browser/README.md) - Development setup
- [Browser Package Review Notes](../../packages/browser/REVIEW-NOTES.md) - Recent fixes
