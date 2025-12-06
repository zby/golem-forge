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

## Goal: Support Custom Tools from Local Modules

Allow loading tools from `tools.ts` files alongside worker definitions.

Inspired by [llm-do](https://github.com/anthropics/llm-do) which loads Python functions
from `tools.py` and wraps them with approval handling.

## Approval Model

### Two-Tier Approval Logic

| Tool Type | `needsApproval` Source |
|-----------|------------------------|
| Built-in with complex logic (filesystem, shell) | Own implementation (zone-aware, rule-based) |
| Custom tool with `needsApproval` defined | Own implementation |
| Custom tool without `needsApproval` | Default from config (`ask` if not specified) |

### Default `needsApproval` Function

Tools that don't define their own `needsApproval` get wrapped with a config-based default:

```typescript
interface ApprovalConfig {
  default?: ApprovalDecisionType;  // 'preApproved' | 'ask' | 'blocked'
  tools?: Record<string, ApprovalDecisionType>;
}

function wrapWithDefaultApproval(
  tool: NamedTool,
  approvalConfig?: ApprovalConfig
): NamedTool {
  // If tool already has needsApproval, respect it
  if (tool.needsApproval !== undefined) {
    return tool;
  }

  // Apply config-based default
  const toolApproval = approvalConfig?.tools?.[tool.name]
    ?? approvalConfig?.default
    ?? 'ask';  // Secure default

  return {
    ...tool,
    needsApproval: toolApproval !== 'preApproved',
  };
}
```

## Custom Tools from `tools.ts`

### Supported Export Formats

**Format 1: Function + Schema** (simple tools)

```typescript
// tools.ts
import { z } from 'zod';

/** Calculate the nth Fibonacci number */
export function calculateFibonacci({ n }: { n: number }): number {
  if (n <= 1) return n;
  let a = 0, b = 1;
  for (let i = 2; i <= n; i++) [a, b] = [b, a + b];
  return b;
}

// Schema must be exported with matching name + "Schema" suffix
// Uses z.object() directly - same pattern as built-in tools
export const calculateFibonacciSchema = z.object({
  n: z.number().int().min(0).describe('Position in sequence'),
});
```

**Format 2: Full Tool Object** (tools needing custom `needsApproval`)

```typescript
// tools.ts
import { z } from 'zod';
import type { NamedTool } from 'golem-forge';

export const calculateFibonacci: NamedTool = {
  name: 'calculateFibonacci',
  description: 'Calculate the nth Fibonacci number',
  inputSchema: z.object({
    n: z.number().int().min(0).describe('Position in sequence'),
  }),
  // Tool can define its own needsApproval
  needsApproval: false,
  execute: async ({ n }) => {
    if (n <= 1) return n;
    let a = 0, b = 1;
    for (let i = 2; i <= n; i++) [a, b] = [b, a + b];
    return b;
  },
};
```

Both formats use `z.object()` for schemas, matching the existing built-in tools pattern.

### Worker Configuration

```yaml
name: calculator
toolsets:
  filesystem: {}
  custom:
    module: "./tools.ts"      # Relative to worker file
    tools:                    # Whitelist of tools to expose
      - calculateFibonacci
      - calculateFactorial
    approval:
      default: ask            # Secure default for all custom tools
      tools:
        calculateFibonacci: preApproved   # Override for specific tool
```

### Loader Implementation

```typescript
export async function loadCustomTools(
  modulePath: string,
  config: CustomToolsetConfig
): Promise<NamedTool[]> {
  const module = await import(modulePath);
  const tools: NamedTool[] = [];

  for (const toolName of config.tools) {
    const exported = module[toolName];

    if (!exported) {
      throw new Error(`Tool '${toolName}' not found in ${modulePath}`);
    }

    // Already a NamedTool object?
    if (isNamedTool(exported)) {
      tools.push(wrapWithDefaultApproval(exported, config.approval));
      continue;
    }

    // Plain function - look for schema
    if (typeof exported === 'function') {
      const schema = module[`${toolName}Schema`];
      if (!schema) {
        throw new Error(`Schema '${toolName}Schema' required for function '${toolName}'`);
      }

      tools.push(wrapWithDefaultApproval({
        name: toolName,
        description: extractDescription(exported) || `Custom tool: ${toolName}`,
        inputSchema: schema,
        execute: async (args) => exported(args),
      }, config.approval));
      continue;
    }

    throw new Error(`Export '${toolName}' must be a function or tool object`);
  }

  return tools;
}
```

## Design Principles

1. **Secure by default** - tools without `needsApproval` require approval
2. **Respect tool's own needsApproval** - if tool defines it, don't override
3. **Whitelist model** - only explicitly listed tools are exposed
4. **Consistent approval types** - `preApproved | ask | blocked` everywhere
5. **AI SDK native** - use SDK patterns, don't reinvent

## Future: External npm Toolsets

```yaml
toolsets:
  # External toolset from npm package
  external:
    package: "@vercel/ai-tools"
    import: "webSearchTools"
    approval:
      default: ask
      tools:
        web_search: preApproved
```

## Open Questions

1. **How do custom tools access sandbox?** Pass via execute options? Inject at load time?
2. **Hot reloading?** Watch tools.ts for changes during development?
3. **Validation?** Runtime checks for tool output format?

## Related

- [tool-approval-design.md](../tool-approval-design.md) - approval system details
- [container-isolation-options.md](container-isolation-options.md) - OS-level isolation for tools
