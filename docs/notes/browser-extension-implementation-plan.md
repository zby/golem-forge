# Browser Extension Implementation Plan

**Status:** Draft
**Based on:** [Browser Extension Architecture](../browser-extension-architecture.md), [Sandbox Design](../sandbox-design.md)

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

**Architecture Decision:** The browser extension will use **user-provided API keys** with direct LLM API calls (no backend proxy required).

**Required Configuration (from validation):**

```typescript
// Anthropic - requires dangerous browser access header
createAnthropic({
  apiKey,
  headers: { 'anthropic-dangerous-direct-browser-access': 'true' }
})

// OpenAI - requires dangerouslyAllowBrowser flag
createOpenAI({
  apiKey,
  dangerouslyAllowBrowser: true
})
```

**Build Configuration:** Use flattened Vite config to avoid manifest path issues:
```typescript
export default defineConfig({
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  }
});
```

## Phase 1: Core Foundation

Goal: Establish the storage structure (OPFS), worker management, and sandbox.

**Recommended order:** 1.1 (storage) → 1.3 (sandbox) → 1.2 (workers) → 1.4 (runtime)

The sandbox depends on storage structure, workers need sandbox for file access, and runtime ties everything together.

### 1.1 Project & Worker Storage

- [ ] Implement `ProjectManager` service
  - [ ] CRUD operations for Projects in `chrome.storage.local`
  - [ ] `WorkerSource` management (bundled vs github)
- [ ] Define data models (`Project`, `WorkerRef`, `SiteTrigger`)

### 1.2 Worker Management

The browser extension uses a fundamentally different approach to worker discovery than the CLI.

**CLI vs Browser Worker Loading:**

| Aspect | CLI (`WorkerRegistry`) | Browser (`WorkerManager`) |
|--------|------------------------|---------------------------|
| Discovery | Scans filesystem at runtime | Workers known at build/sync time |
| Loading | Reads `.worker` files from disk | Bundled or fetched from GitHub |
| Caching | File mtime-based | Static manifest or GitHub sync |
| Configuration | `LLM_DO_PATH` env var | Extension settings |

**Decision:** Do not abstract `WorkerRegistry` into a shared interface. Instead:

1. **Keep `WorkerRegistry` as CLI-only** - Node.js filesystem scanning is CLI infrastructure
2. **Create `WorkerManager` for browser** - Different mental model (sources, not paths)
3. **Share `WorkerDefinition` schema and `parseWorkerString()`** - The parser is already portable

Implementation:

- [ ] Create `WorkerManager` interface for browser
  ```typescript
  interface WorkerManager {
    getSources(): Promise<WorkerSource[]>;
    getWorker(sourceId: string, workerId: string): Promise<WorkerDefinition>;
    syncGitHubSource(repo: string): Promise<void>;
  }
  ```
- [ ] Implement bundled worker loading (from extension bundle)
- [ ] Implement GitHub worker syncing (fetch and cache in OPFS)
- [ ] Create initial bundled worker definitions (e.g., `pitchdeck-analyzer.worker`)

### 1.3 OPFS Sandbox

The browser sandbox implements the same mount-based model as CLI (Docker-style bind mounts), backed by OPFS instead of Node.js fs.

- [ ] Implement `MountSandbox` interface for OPFS
  - [ ] `read(path)`, `write(path, content)`, `list(path)`, `delete(path)`
  - [ ] `resolve(path)` - map virtual paths to OPFS paths
  - [ ] `restrict(config)` - create restricted sandbox for sub-workers
  - [ ] `canWrite(path)` - check write permissions
- [ ] Implement mount configuration
  - [ ] Root mount: `/projects/{id}/` as sandbox root
  - [ ] `readonly` mode enforcement
  - [ ] Path boundary validation (no escape via `..`)
- [ ] Implement session isolation
  - [ ] Create unique `/working/{session-id}` directories
  - [ ] Session cleanup on completion

### 1.4 Basic Worker Runtime

**Depends on:** Phase 0.1 validation ✅ (complete)

The browser runtime uses the same Vercel AI SDK as CLI, with user-provided API keys.

- [ ] Port core `WorkerRuntime` to browser environment
  - [ ] Replace Node.js-specific imports
  - [ ] Upgrade from `generateText()` to `streamText()` for real-time responses
  - [ ] Create `BrowserAIService` wrapper for provider management
    - Use `createAnthropic()` with `anthropic-dangerous-direct-browser-access` header
    - Use `createOpenAI()` with `dangerouslyAllowBrowser: true`
    - Use `maxOutputTokens` (not deprecated `maxTokens`) for `streamText()`
- [ ] Implement API key management
  - [ ] Settings UI for entering API keys per provider
  - [ ] Secure storage in `chrome.storage.local`
  - [ ] Validation on key entry
- [ ] Add manifest permissions for LLM APIs:
  ```json
  "host_permissions": [
    "https://api.anthropic.com/*",
    "https://api.openai.com/*",
    "https://generativelanguage.googleapis.com/*"
  ]
  ```
- [ ] Configure Vite build for extension (see Phase 0 config)
  - [ ] `root: 'src'` to flatten output structure
  - [ ] `outDir: '../dist'` for correct manifest paths
  - [ ] Add `@types/chrome` as dev dependency
- [ ] Implement tool execution for browser
  - [ ] File tools using OPFS sandbox
  - [ ] Web fetch tool (with CORS handling)
- [ ] Mock advanced tools for initial testing (before WASM)

## Phase 2: GitHub Integration

Goal: Enable synchronization between OPFS projects and GitHub repositories.

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

## Phase 3: UI & Triggers

Goal: User-facing interface for managing projects and triggering workers from websites.

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

Goal: Harden isolation for untrusted content.

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

| Milestone | Deliverable |
|-----------|-------------|
| **M1: MVP Core** | Project creation, OPFS storage, local worker execution |
| **M2: Sync** | GitHub Auth, Pull/Push, Staging UI |
| **M3: Integration** | Hey.com Pitch Deck Analyzer demo (End-to-End) |
| **M4: Security** | WASM isolation, audit logging |

## Related Documents

- [Browser Extension Architecture](../browser-extension-architecture.md) - System architecture
- [Sandbox Design](../sandbox-design.md) - Zone model and clearance protocol
- [AI SDK Browser Validation](./ai-sdk-browser-validation.md) - Phase 0 validation experiment
- [AI SDK Browser Lessons](./ai-sdk-browser-lessons.md) - Lessons learned from validation
- [Container Isolation Options](./container-isolation-options.md) - WASM and other isolation strategies
