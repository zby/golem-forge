# @golem-forge/core

Platform-agnostic types and utilities shared between golem-forge implementations.

## Purpose

This package contains types that are used by both:
- **CLI** (`@golem-forge/cli`): Node.js-based implementation
- **Browser Extension** (`@golem-forge/extension`): OPFS-based implementation

By extracting shared types here, we avoid duplication and ensure consistency across platforms.

## Installation

This package is part of the golem-forge monorepo and is linked via npm workspaces.

```bash
# From any package in the monorepo
npm install @golem-forge/core
```

## Usage

```typescript
import {
  FileOperations,
  FileStat,
  MountSandbox,
  SandboxError,
  NotFoundError,
} from '@golem-forge/core';
```

## What Belongs Here

- **Pure TypeScript types** (interfaces, type aliases) - no runtime code that requires Node.js
- **Error classes** that don't depend on platform-specific APIs
- **Zod schemas** (future) - Zod is browser-compatible

## What Does NOT Belong Here

- Node.js-specific code (fs, path, Buffer, etc.)
- Browser-specific code (DOM APIs, OPFS, chrome.*)
- Implementation classes (interfaces go here, implementations go in platform packages)

## Package Structure

```
packages/core/
├── src/
│   ├── index.ts           # Barrel exports
│   ├── sandbox-types.ts   # FileOperations, FileStat, Mount*, etc.
│   └── sandbox-errors.ts  # SandboxError, NotFoundError, etc.
├── package.json
├── tsconfig.json
└── README.md
```

## Future Additions

As golem-forge evolves, this package will include:
- Worker definition schemas (`WorkerDefinitionSchema`, etc.)
- Approval types (`UIApprovalRequest`, `UIApprovalResult`)
- Shared UI types for Ink adoption

## See Also

- [Main README](../../README.md) - Project overview and concepts
- [@golem-forge/cli](../cli/) - CLI tool and Node.js runtime
- [@golem-forge/extension](../extension/) - Browser extension
