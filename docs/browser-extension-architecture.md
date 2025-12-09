# Browser Extension Architecture Specification

> **Note:** This document describes the target architecture. The extension shares the runtime engine
> with CLI via `@golem-forge/core`. Browser-specific adapters are in `@golem-forge/chrome`.
> See `docs/notes/core-vs-platform.md` for architecture boundaries.

## Overview

This document specifies the architecture for **Golem Forge**, a browser-based LLM worker system. It uses OPFS (Origin Private File System) for local storage and GitHub as the synchronization layer, enabling a "Project" based workflow where each project maps to a GitHub repository.

## Related Documents

- **[User Stories](./user-stories.md)** - Requirements and acceptance criteria
- **[Sandbox Design](./sandbox-design.md)** - Unified sandbox system
- **[Project Management](./use-cases/browser-project-management.md)** - Project & Worker management
- **[Container Options](./notes/container-isolation-options.md)** - Isolation strategies (WASM for browser)

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Browser Extension                                  │
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐│
│  │   Content   │  │  Background │  │   Popup/    │  │    Offscreen        ││
│  │   Scripts   │  │   Service   │  │   Options   │  │    Document         ││
│  │ (Triggers)  │  │   Worker    │  │   Pages     │  │    (OPFS sync)      ││
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘│
│         │                │                │                     │           │
│         └────────────────┴────────────────┴─────────────────────┘           │
│                                   │                                         │
│                    ┌──────────────┴──────────────┐                          │
│                    │         Core Engine         │                          │
│                    │                             │                          │
│                    │  ┌───────────────────────┐  │                          │
│                    │  │    ProjectManager     │  │                          │
│                    │  │    - config & state   │  │                          │
│                    │  └───────────────────────┘  │                          │
│                    │                             │                          │
│                    │  ┌───────────────────────┐  │                          │
│                    │  │     WorkerManager     │  │                          │
│                    │  │   - bundled/github    │  │                          │
│                    │  └───────────────────────┘  │                          │
│                    │                             │                          │
│                    │  ┌───────────────────────┐  │                          │
│                    │  │     FileSandbox       │  │                          │
│                    │  │     (OPFS-backed)     │  │                          │
│                    │  └───────────────────────┘  │                          │
│                    │                             │                          │
│                    │  ┌───────────────────────┐  │                          │
│                    │  │      GitSync          │  │                          │
│                    │  │      (Octokit)        │  │                          │
│                    │  └───────────────────────┘  │                          │
│                    │                             │                          │
│                    │  ┌───────────────────────┐  │                          │
│                    │  │   WorkerRuntime       │  │                          │
│                    │  │   - tool execution    │  │                          │
│                    │  │   - WASM (future)     │  │                          │
│                    │  └───────────────────────┘  │                          │
│                    │                             │                          │
│                    └─────────────────────────────┘                          │
│                                   │                                         │
└───────────────────────────────────┼─────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
            ┌───────────────┐               ┌───────────────┐
            │   LLM APIs    │               │  GitHub API   │
            │  (Anthropic,  │               │   (Octokit)   │
            │   OpenAI)     │               │               │
            └───────────────┘               └───────┬───────┘
                                                    │
                                                    ▼
                                            ┌───────────────┐
                                            │  GitHub Repo  │
                                            │ (sync layer)  │
                                            └───────┬───────┘
```

## Storage Architecture

We use a combination of `chrome.storage.local` for metadata/configuration and OPFS for file content.

### Extension Storage (Metadata)

```
chrome.storage.local:
├── projects/
│   ├── {project-id}/
│   │   └── config.json        # Project configuration (repo, workers, triggers)
│   └── ...
├── worker-sources/
│   ├── bundled.json           # List of bundled workers
│   └── github-{owner}-{repo}.json
└── settings/
    ├── global.json
    └── credentials.json       # Encrypted tokens (or use chrome.storage.session)
```

### OPFS Structure (Content)

```
/opfs-root/
├── projects/
│   └── {project-id}/
│       ├── .meta/
│       │   ├── permissions.json   # Security permissions
│       │   ├── audit.log          # Action audit trail
│       │   └── config.json        # Synced project config
│       ├── cache/
│       │   ├── pdfs/              # Downloaded PDFs
│       │   ├── web/               # Fetched web content
│       │   └── attachments/       # Other cached files
│       ├── working/
│       │   └── {session-id}/      # Session-isolated working area
│       │       ├── inputs/        # Files for this session
│       │       └── outputs/       # Generated files
│       └── staged/
│           └── {commit-id}/       # Files pending GitHub sync
│               ├── manifest.json  # What changed and why
│               └── files/         # Actual file content
└── workers/
    ├── bundled/                   # Read from extension bundle
    │   ├── pitchdeck-analyzer.worker
    │   └── ...
    └── github/                    # Synced from user repos
        └── {owner}-{repo}/
            └── *.worker
```

## Core Concepts

### Projects

A **Project** is the primary unit of work, mapping 1:1 to a GitHub repository.

```typescript
interface Project {
  id: string;
  name: string;
  createdAt: Date;

  // Output destination
  github: {
    owner: string;
    repo: string;
    branch: string;
  };

  // Enabled workers
  workers: WorkerRef[];

  // Site triggers
  triggers: SiteTrigger[];
}
```

### Workers & Sources

Workers are functional units (e.g., "Pitch Deck Analyzer"). They can come from:
1.  **Bundled**: Built-in to the extension (read-only, verified).
2.  **GitHub**: Imported from user repositories (synced).

```typescript
interface WorkerRef {
  source: 'bundled' | 'github';
  id: string; // e.g., "pitchdeck-analyzer" or "my-workers/custom-analyzer"
}

interface WorkerSource {
  id: string;
  type: 'bundled' | 'github';
  // ... GitHub details if applicable
  workers: WorkerDefinition[];
}
```

### Site Triggers

Triggers allow workers to be activated automatically on specific websites.

```typescript
interface SiteTrigger {
  id: string;
  urlPattern: string;      // e.g., "https://hey.com/*"
  workerId: string;        // e.g., "pitchdeck-analyzer"
  injectSelector?: string; // DOM selector to inject UI
  enabled: boolean;
}
```

**Flow:**
1.  Content Script matches URL pattern.
2.  Injects "Analyze" button/UI.
3.  User clicks -> Sends message to Background.
4.  Background starts Session with specific Worker.

## Security Model

### Trust Levels

| Level | Description | Capabilities |
|-------|-------------|--------------|
| **Untrusted** | Web content, auto-triggers | Write to `working/` only. No repo read access. |
| **Session** | User-initiated (e.g., clicked button) | Read `cache/`, `working/`. Stage files. No direct push. |
| **Project** | Trusted workspace | Read repo files. Stage files. |
| **Full** | Admin/Config | Manage settings, tokens. |

### Isolation & Sandboxing

1.  **Logical Isolation (Phase 1)**:
    *   **Zone-based Access**: Workers restricted to specific OPFS paths (`/input`, `/output`).
    *   **Session Isolation**: Each execution gets a fresh `/working/{session-id}` directory.
    *   **Read-Only Repo**: Untrusted sessions cannot read existing repository files (prevents exfiltration).

2.  **Container Isolation (Phase 2 - Future)**:
    *   **WASM (WebAssembly)**: Run tools/workers in a WASI environment within the browser.
    *   Provides strong memory and execution isolation, similar to Docker but browser-compatible.
    *   See `docs/notes/container-isolation-options.md`.

### Prompt Isolation

Content from web pages is wrapped to prevent injection:

```typescript
function createIsolatedPrompt(webContent: string, task: string) {
  return `
# Security Context
Trust Level: Untrusted
Permissions: Write to working directory only.

# User Task
${task}

# Input Content (UNTRUSTED)
<untrusted_content>
${webContent}
</untrusted_content>
`;
}
```

## GitSync Component

The bridge between OPFS and GitHub.

1.  **Stage**: Worker writes files to `/staged/{commit-id}/`.
2.  **Review**: User sees diff in Extension Popup.
3.  **Commit & Push**: User approves -> Extension uses Octokit to push to GitHub.

## Implementation Phases

### Phase 1: Core Foundation
- Project & Worker Management (Storage/Config)
- OPFS-backed FileSandbox
- Basic Worker Runtime (Logical Isolation)

### Phase 2: GitHub Integration
- OAuth Flow
- Octokit Integration (Read/Write/Push)
- GitSync Logic (Staging area)

### Phase 3: UI & Triggers
- Extension Popup (Project creation, Worker selection)
- Content Script Triggers (URL matching, Injection)
- Approval UI

### Phase 4: Advanced Security
- WASM-based Tool Execution (Container Isolation)
- Advanced Permission Controls

## API Summary

### ProjectManager
```typescript
interface ProjectManager {
  createProject(config: ProjectConfig): Promise<Project>;
  getProject(id: string): Promise<Project>;
  listProjects(): Promise<Project[]>;
  syncWorkerSource(sourceId: string): Promise<void>;
}
```

### WorkerRuntime

The browser extension uses `@golem-forge/core`'s `WorkerRuntime` with browser-specific adapters:

```typescript
import { WorkerRuntime, createWorkerRuntime } from '@golem-forge/core';

// Browser-specific factory
async function createBrowserWorkerRuntime(options) {
  // Create OPFS sandbox
  const sandbox = await createOPFSSandbox(projectPath);

  // Create tools using core's ToolsetRegistry with browser adapters
  const tools = await createTools(worker.toolsets, {
    sandbox,
    gitBackend: new IsomorphicGitBackend({ fs: opfsAdapter }),
    // ...browser-specific context
  });

  // Use core's runtime
  return createWorkerRuntime({
    worker,
    tools,
    sandbox,
    approvalController,
  });
}
```
