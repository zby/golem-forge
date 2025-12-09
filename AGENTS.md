# AGENTS.md - Field Guide for AI Agents

Key expectations that frequently trip up automation agents. See `README.md` for setup and usage.

---

## Monorepo Structure

This is an npm workspaces monorepo with four packages:

| Package | Path | Purpose |
|---------|------|---------|
| `@golem-forge/core` | `packages/core/` | Runtime engine, tools, approval system, AI SDK integration |
| `@golem-forge/ui-react` | `packages/ui-react/` | React-based UI state management (used by CLI Ink and Chrome) |
| `@golem-forge/cli` | `packages/cli/` | CLI tool with Node.js adapters (fs sandbox, shell tools, git CLI backend) |
| `@golem-forge/chrome` | `packages/chrome/` | Chrome extension with browser adapters (OPFS sandbox, isomorphic-git) |

---

## Key References

- `README.md` - setup, CLI usage, examples
- `docs/concept.md` - design philosophy and core concepts
- `docs/notes/` - working design documents and explorations (see Notes section)
- `docs/notes/core-vs-platform.md` - **architecture boundary rules** (core vs platform packages)
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

### Architecture Boundary

**Core = logic, platform packages = adapters.**

- Runtime logic, AI SDK integration, and tool registries belong in `@golem-forge/core`
- CLI and Chrome packages only provide adapters (sandbox, UI, backends)
- Run `npm run check:arch` to verify no violations
- See `docs/notes/core-vs-platform.md` for full guidelines

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
