# Worker Auto‑Preamble Note

## Context

Workers (`.worker` files) and SKILLS‑style docs are conceptually close: both describe a focused capability plus constraints and usage guidance. Today, many workers restate configuration details (tools, sandboxes, approvals) inside their instruction bodies, which creates drift and makes workers less “skills‑like”.

This note records the idea of an **auto‑generated preamble** and why it is not urgent.

## Current State

- The LLM always receives tool schemas automatically via AI SDK tool injection (`generateText({ tools: llmTools })`). The model already knows tool names, descriptions, and JSON input/output schemas.
- The LLM does **not** automatically see most front‑matter configuration semantics (sandbox rules, attachment policy, mode/chat limits, compatible model constraints, output schema refs, etc.).
- Because of that, authors often duplicate config as prose in the worker body (e.g., “Available tools…”, “Sandbox access…”, approval notes). This is optional and inconsistent.

## Auto‑Preamble Proposal (Prompt‑Level)

At runtime, prepend a short deterministic header to the system instructions that summarizes **non‑tool configuration semantics** derived from worker front matter plus resolved runtime state.

Key intent:

- **Single source of truth**: avoid restating sandbox/approval/attachment rules in body.
- **Skills‑like shape**: a canonical header gives every worker a consistent “capabilities” section.
- **Safety/clarity**: ensures the LLM sees real constraints even if the body omits them.

Important clarification:

- Since tools are already injected as schemas, the preamble should **not** redundantly enumerate tools unless it adds human‑readable value. Prefer a compact capability summary (“filesystem tools enabled”, “workers: greeter, analyzer”) over listing 20 tool names.

## Risks / Trade‑offs

- **Behavior drift**: existing workers already restate tools/sandbox. A new header could conflict or just add noise, subtly shifting model behavior.
- **Token overhead**: listing tools or verbose sandbox rules can bloat the system prompt.
- **Over‑anchoring**: a strong header can push the model to overuse tools or follow header phrasing over nuanced instructions.
- **Determinism requirement**: header text must be stable across runs (sorted tools, canonical formatting) to keep tests/cache/diffs predictable.

## Architecture Considerations

- Tool resolution is platform‑specific (CLI/Chrome adapters). Core should not re‑implement adapter logic.
- Therefore, preamble generation should happen **after tools are injected**, inside core runtime just before the LLM call, using the already‑resolved LLM tool list (`getLLMTools()`), plus front matter config.

## Recommendation

Not urgent. The convergence benefit is real, but rollout should be cautious:

1. Start with a **UI/docs preamble** (human‑visible header in CLI/Chrome/tool descriptions) to validate format and usefulness without changing LLM prompts.
2. If liked, move to **prompt‑level preamble**, kept short and focused on non‑tool constraints.
3. Update scaffolds and `worker_create` templates to rely on the header and avoid duplication in bodies.

## Open Questions

- Should prompt‑level preamble be default‑on, or opt‑in via front matter (e.g., `auto_preamble: false|true`)?
- What exact fields belong in the header, and what should remain purely runtime?
- What is the right verbosity for tool capabilities: none, compact toolset summary, or full list for small toolsets?

