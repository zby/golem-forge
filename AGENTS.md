# AGENTS.md - Field Guide for AI Agents

Key expectations that frequently trip up automation agents. See `README.md` for setup and usage.

---

## Key References

- `README.md` - setup, CLI usage, examples
- `docs/concept.md` - design philosophy and core concepts
- `docs/notes/` - working design documents and explorations (see Notes section)
- `typescript-port-plan.md` - implementation plan with experiments
- `experiments/` - validation experiments (code moves to src/ after validation)
- Uses [Vercel AI SDK](https://ai-sdk.dev/) for LLM abstraction

---

## Development

- Run `npm test` before committing (tests use mock models, no live API calls)
- Use `npm run build` to compile TypeScript
- Experiments go in `experiments/NN-name/` - after validation, move code to `src/`
- Test worker features by creating example projects in `examples/` and running with `golem-forge`
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
