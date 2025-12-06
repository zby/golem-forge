# Tool Extensibility Design

**Status:** Planning

## Current State

Tools are organized into **toolsets** - classes that group related tools:

- `FilesystemToolset` - read_file, write_file, list_files, delete_file, file_exists, file_info
- `ShellToolset` - shell command execution
- `WorkerCallToolset` - delegate to other workers

Workers declare which toolsets they need:

```yaml
toolsets:
  filesystem: {}
  shell:
    rules:
      - pattern: "git "
        approval: preApproved
```

### Adding New Built-in Toolsets

1. Create toolset class in `src/tools/` with `getTools(): NamedTool[]`
2. Export from `src/tools/index.ts`
3. Add case in `WorkerRuntime.registerTools()` (src/runtime/worker.ts)
4. Update worker schema if config options needed

### Tool Interface

Tools follow Vercel AI SDK pattern with added `name`:

```typescript
type NamedTool = Tool<any, any> & { name: string };

// Tool has:
// - description: string
// - inputSchema: Zod schema
// - needsApproval?: boolean | ((input, options) => boolean)
// - execute: (input, options) => Promise<Result>
```

## Goal: Support External AI SDK Tools

Allow using any Vercel AI SDK tool or toolset with automatic approval wrapping.

### Wrapper Approach

```typescript
function wrapTool(
  name: string,
  tool: Tool<any, any>,
  approval?: ApprovalDecisionType
): NamedTool {
  return {
    ...tool,
    name,
    needsApproval: tool.needsApproval ?? (approval !== 'preApproved'),
  };
}

function wrapToolset(
  toolset: Record<string, Tool>,
  approvalConfig?: Record<string, ApprovalDecisionType>
): NamedTool[] {
  return Object.entries(toolset).map(([name, tool]) =>
    wrapTool(name, tool, approvalConfig?.[name])
  );
}
```

### Worker Config (Future)

```yaml
toolsets:
  filesystem: {}

  # External toolset from npm package
  external:
    package: "@vercel/ai-tools"
    import: "webSearchTools"
    approval:
      web_search: preApproved
      web_fetch: ask

  # Custom tool from local module
  custom:
    module: "./tools/my-tool.ts"
    approval: ask
```

## Design Principles

1. **Secure by default** - unknown tools require approval
2. **Respect tool's own needsApproval** - if tool defines it, don't override
3. **Consistent approval types** - `preApproved | ask | blocked` everywhere
4. **AI SDK native** - use SDK patterns, don't reinvent

## Open Questions

1. **How to load external toolsets?** Dynamic import vs build-time bundling
2. **How to validate external tools?** Schema checking, capability restrictions
3. **Toolset-level vs tool-level approval?** Allow both or pick one
4. **How do external tools interact with sandbox?** Pass sandbox to tool factory?

## Related

- [tool-approval-design.md](../tool-approval-design.md) - approval system details
- [container-isolation-options.md](container-isolation-options.md) - OS-level isolation for tools
