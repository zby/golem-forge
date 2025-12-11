# @golem-forge/core

Platform-agnostic runtime engine, tools, and types shared between golem-forge implementations.

## Purpose

This package contains **all runtime logic** used by both platforms:
- **CLI** (`@golem-forge/cli`): Node.js-based implementation
- **Chrome Extension** (`@golem-forge/chrome`): Browser-based implementation

The core package owns the runtime loop, AI SDK integration, tool registries, and approval system.
Platform packages only provide adapters (sandboxes, worker registries, UI, backends).

## What's in Core

### Runtime Engine
- `WorkerRuntime` - Main runtime loop with tool execution
- `createWorkerRuntime` - Factory for creating runtime instances
- `ToolExecutor` - Handles tool calls with approval gates
- `streamText`/`generateText` - Re-exported AI SDK functions (platform packages should use these)

### Tool Infrastructure
- `ToolsetRegistry` - Registry for toolset factories
- `FilesystemToolset` - Portable file operations tools
- `WorkerCallToolset` - Worker delegation tools
- `CustomToolset` - User-defined custom tools from JS/TS modules
- `GitToolset` - Git operations with staged commits (push, pull, merge)

### Approval System
- `ApprovalController` - Manages approval flow for dangerous operations
- `ApprovalMemory` - Remembers user decisions per session

### UI Infrastructure
- `UIEventBus` - Event-driven communication between runtime and UI
- `RuntimeUI` - High-level wrapper for UI operations
- Event types for messages, streaming, tool results, approvals

### Worker Schema
- `WorkerDefinitionSchema` - Zod schema for .worker file validation
- `parseWorkerString` - Parser for worker file format

### Git Backend
- `IsomorphicGitBackend` - Pure JS git implementation (works in browser)
- `GitBackend` interface for platform-specific implementations

## Installation

This package is part of the golem-forge monorepo and is linked via npm workspaces.

```bash
# From any package in the monorepo
npm install @golem-forge/core
```

## Usage

```typescript
// Runtime
import {
  WorkerRuntime,
  createWorkerRuntime,
  streamText,
  generateText,
} from '@golem-forge/core';

// Tools
import {
  ToolsetRegistry,
  FilesystemToolset,
  WorkerCallToolset,
  GitToolset,
} from '@golem-forge/core';

// Approval
import {
  ApprovalController,
  ApprovalMemory,
} from '@golem-forge/core';

// Types
import type {
  FileOperations,
  WorkerDefinition,
  RuntimeUI,
  NamedTool,
} from '@golem-forge/core';
```

## Architecture Boundary

**Core = logic, platform packages = adapters.**

### Core Owns:
- Runtime loop and AI SDK integration
- Tool registries and toolset factories
- Approval system logic
- Type definitions and schemas
- Portable toolsets (filesystem, workers, custom, git)

### Platform Packages Provide:
- Sandbox implementations (`createMountSandbox`, `createOPFSSandbox`)
- Worker registries (file-based, bundled)
- UI adapters (Ink terminal, React web)
- Platform-specific backends (CLI git via spawn, shell tools)
- Factory functions that call core with injected dependencies

See `docs/notes/core-vs-platform.md` for detailed guidelines.

## Package Structure

```
packages/core/
├── src/
│   ├── index.ts              # Barrel exports
│   ├── approval/             # Approval system
│   │   ├── controller.ts
│   │   ├── memory.ts
│   │   └── types.ts
│   ├── runtime/              # Runtime engine
│   │   ├── worker.ts         # WorkerRuntime class
│   │   ├── tool-executor.ts  # Tool execution with approval
│   │   ├── model-factory.ts  # AI model creation
│   │   └── events.ts         # Runtime event types
│   ├── tools/                # Portable toolsets
│   │   ├── registry.ts       # ToolsetRegistry
│   │   ├── filesystem.ts     # FilesystemToolset
│   │   ├── worker-call.ts    # WorkerCallToolset
│   │   ├── custom.ts         # CustomToolset
│   │   └── git/              # Git toolset
│   │       ├── index.ts
│   │       ├── tools.ts
│   │       ├── backend.ts
│   │       └── isomorphic-backend.ts
│   ├── sandbox-types.ts      # FileOperations, Mount types
│   ├── sandbox-errors.ts     # SandboxError classes
│   ├── worker-schema.ts      # WorkerDefinition Zod schema
│   ├── worker-parser.ts      # .worker file parser
│   ├── ui-events.ts          # UI event type definitions
│   ├── ui-event-bus.ts       # Event bus implementation
│   └── runtime-ui.ts         # RuntimeUI wrapper
├── package.json
├── tsconfig.json
└── README.md
```

## See Also

- [Main README](../../README.md) - Program overview and concepts
- [Architecture Boundary](../../docs/notes/core-vs-platform.md) - Core vs platform rules
- [@golem-forge/cli](../cli/) - CLI tool and Node.js adapters
- [@golem-forge/chrome](../chrome/) - Chrome extension and browser adapters
