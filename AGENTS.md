# AGENTS.md - Field Guide for AI Agents

Key expectations that frequently trip up automation agents. See `README.md` for setup and usage.

---

## Monorepo Structure

This is an npm workspaces monorepo with three packages:

| Package | Path | Purpose |
|---------|------|---------|
| `@golem-forge/core` | `packages/core/` | Shared types and utilities (sandbox types, errors) |
| `@golem-forge/cli` | `packages/cli/` | CLI tool and Node.js runtime |
| `@golem-forge/chrome` | `packages/chrome/` | Chrome extension |

---

## Key References

- `README.md` - setup, CLI usage, examples
- `docs/concept.md` - design philosophy and core concepts
- `docs/notes/` - working design documents and explorations (see Notes section)
- `packages/*/README.md` - package-specific documentation
- Uses [Vercel AI SDK](https://ai-sdk.dev/) for LLM abstraction

---

## Development

### Monorepo Commands

```bash
# Install all dependencies
npm install

# Build core and CLI (extension depends on core)
npm run build

# Build everything including extension
npm run build:all

# Run all tests
npm test

# Run tests for specific package
npm run test:cli
npm run test:browser
```

### Package-Specific Development

```bash
# Work on CLI
npm run build -w @golem-forge/core   # Build dependency first
npm run test -w @golem-forge/cli

# Work on Chrome extension
npm run build -w @golem-forge/core   # Build dependency first
npm run dev -w @golem-forge/chrome   # Watch mode
```

### Guidelines

- Run `npm test` before committing (tests use mock models, no live API calls)
- Shared types go in `@golem-forge/core`, not duplicated across packages
- Do not preserve backwards compatibility; with no external consumers, always prioritize cleaner design over keeping old behavior alive
- **YAGNI**: Don't implement features that aren't needed yet. If you identify a gap in the spec, create a note in `docs/notes/` instead of implementing it
- Favor clear architecture over hacks; delete dead code when possible
- If backcompat code is ever needed, mark it with `// BACKCOMPAT: <reason> - remove after <condition>` so it can be identified and removed later
- **Fail early**: Throw errors on invalid input, typos in config, missing initialization, etc. Don't hide bugs by silently recovering - this is experimental code and explicit failures are easier to debug than subtle misbehavior

---

## Worker Design

- Keep each worker focused on a single unit of work; use worker delegation for sub-tasks
- Each allowed worker becomes a directly callable tool (e.g., `greeter(input: "...")`)
- Declare sandboxes explicitly with the minimal access needed
- Document available tools in `instructions` so models know how to call them

---

## Git Discipline

- **Never** `git add -A` - review `git status` and stage specific files
- Check `git diff` before committing

---

## Notes

- `docs/notes/` - working design documents, explorations, bug investigations
- Create notes to offload complex thinking that doesn't fit in a commit or TODO
- Include "Open Questions" section for unresolved decisions
- Move to `docs/notes/archive/` when resolved or implemented

---

Stay small, stay testable, trust the LLM.
