# Experiment 1.4: Worker Definition Parsing

## Goal

Validate that YAML worker definitions work in TypeScript using gray-matter for frontmatter extraction and Zod for schema validation.

## Status: COMPLETE

## Files

```
src/
├── schema.ts       # Zod schemas for worker config
├── parser.ts       # Parser using gray-matter
├── parser.test.ts  # Tests
└── index.ts        # Exports

workers/            # Sample worker files
├── greeter.worker
├── file_processor.worker
└── orchestrator.worker

demo.ts             # Demo script
```

## Running

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run demo
npm run demo
```

## Key Concepts

### Worker File Format

```yaml
---
name: worker_name          # Required
description: Description   # Optional
model: anthropic:claude-sonnet-4  # Optional
compatible_models:         # Optional
  - "anthropic:*"
sandbox:                   # Optional
  paths:
    output:
      root: ./output
      mode: rw
      suffixes: [".txt"]
      max_file_bytes: 100000
      write_approval: true
toolsets:                  # Optional
  filesystem: {}
  delegation:
    allow_workers: ["*"]
attachment_policy:         # Optional
  max_attachments: 4
  max_total_bytes: 10000000
---

Instructions go here (the worker's system prompt).
```

### Zod Schemas

```typescript
// Main worker definition schema
const WorkerDefinitionSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  model: z.string().optional(),
  compatible_models: z.array(z.string()).optional(),
  sandbox: SandboxConfigSchema.optional(),
  toolsets: ToolsetsConfigSchema.optional(),
  attachment_policy: AttachmentPolicySchema.optional(),
  instructions: z.string(),
  // ... more fields
});
```

### Parsing Flow

```
.worker file
     │
     ▼
┌─────────────┐
│ gray-matter │  Extract YAML frontmatter + body
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Zod Schema  │  Validate frontmatter structure
└──────┬──────┘
       │
       ▼
WorkerDefinition
```

## Success Criteria

- [x] Same .worker file format works
- [x] Type validation catches bad configs
- [ ] Instructions execute correctly (deferred - needs lemmy integration)

## Schema Validation Examples

### Valid Worker

```yaml
---
name: greeter
description: Greets users
---
You are a friendly assistant.
```

### Invalid Worker (missing name)

```yaml
---
description: Missing name
---
Instructions
```

Error: `Invalid worker frontmatter: name is required`

### Invalid Worker (bad sandbox mode)

```yaml
---
name: bad
sandbox:
  paths:
    out:
      root: ./out
      mode: invalid
---
```

Error: `Invalid enum value. Expected 'ro' | 'rw'`

## Next Steps

→ After validation, move to `src/worker/`
→ Integrate with lemmy for actual execution (Experiment 1.5 or later)
