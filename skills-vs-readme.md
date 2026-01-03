# Skills vs README

When to package LLM agent behavior as a skill vs file-based instructions.

**Editorial note:** I think this article overstates the advantage of skills. In practice, the main difference is *when and how instructions get loaded into context* - and most CLI tools let you configure that easily. A well-structured README with clear loading instructions often works just as well.

**Standard reference:** This article discusses concepts now formalized in the [Agent Skills](https://agentskills.io) open standard—"a simple, open format for giving agents new capabilities and expertise." Originally developed by Anthropic, the standard is now supported by Claude Code, Claude.ai, GitHub, VS Code, Cursor, and other platforms.

## What "skills" are, from first principles

A “skill” is not magic. At the lowest level it’s just **a way of packaging and reliably injecting behavior into an LLM agent**.

If you model an LLM-based coding assistant as:

* **Model** (the raw LLM)
* **Context** (system/developer instructions + your message + retrieved files)
* **Tools** (shell, file search, editor, etc.)
* **Policy/priority rules** (what instructions outrank others)

…then a “skill” is best thought of as a **reusable contract** that bundles:

1. **Procedure**: a repeatable workflow (“do A, then B, validate C, produce output D in format E”).
2. **Constraints/guardrails**: what to do / not do (style rules, safety rules, repo conventions).
3. **Interfaces**: how the assistant should use tools (shell commands, file layout, where outputs go).
4. **Triggers / invocation**: a stable name or command that reliably pulls the above into the agent’s working context.

So “skill” = **a macro / function** for an agent. Sometimes it’s pure text (markdown playbook). Sometimes it includes code (an executable or tool wrapper). The key is not “it exists as a file” — it’s **how reliably and with what priority the content gets applied.**

---

### If it’s “just instructions,” why isn’t a README equivalent?

In a purely theoretical sense, they *can be* equivalent:

> If every time you asked, the system took the README, injected it into the prompt at the same priority level, with the same completeness, and the model followed it perfectly — then a README and a “skill” are the same thing.

In practice, they differ because the real system has **failure modes and ergonomics**.

Here’s the practical difference:

* **README approach**: “Please go fetch this file, interpret it correctly, keep it in mind, and apply it.”
* **Skill approach**: “When this intent happens (or this slash command is used), load this vetted procedure at a known priority and follow it.”

That changes reliability, security, cost, UX, and observability.

---

## The differences, from every angle

### 1) Instruction priority: where the text sits matters more than people think

Most assistants effectively have an instruction stack like:

1. **System** (highest priority)
2. **Developer**
3. **User**
4. **Retrieved / file content** (often treated like user-provided context)

A “skill” is often injected at **system/developer priority** (or a similarly privileged layer).
A README you ask it to read is almost always **just retrieved context**.

That creates real behavioral differences:

* If the README conflicts with a higher-level rule, the model should ignore README parts.
* Skills can *override* user phrasing in a controlled way (e.g., “always include tests,” “never modify lockfiles,” “follow our task template exactly”).
* Skills can also ensure the model doesn’t “negotiate” the procedure away when the user asks for shortcuts.

**Bottom line:** A skill can be “authoritative”; a README is “advisory.”

---

### 2) Reliability & completeness: “reading a file” is not deterministic

When you say “please read docs/tasks/README.md” you are betting on a chain:

1. The assistant picks the right file.
2. The tool returns the full content (no truncation).
3. The assistant doesn’t miss a crucial detail.
4. The assistant applies it correctly *later in the same run*.

Any break produces drift.

Skills reduce this because:

* They can be **preloaded** (no fetch step).
* They can be **curated to be short, structured, and unambiguous**.
* They often come with **checklists/templates** that make it harder for the model to omit required sections.

This is why “playbooks” written for humans (READMEs) often perform worse than “skills” written for agents (tight, imperative, token-efficient, with output schema).

---

### 3) Token economics and attention: always-loaded vs on-demand

Two opposite tradeoffs:

**README-on-demand**

* ✅ No baseline context cost when you’re not doing that workflow
* ❌ You pay retrieval + reading tokens every time
* ❌ The model may summarize/forget details; the more it compresses, the more it mutates the procedure

**Skill (preloaded or easily injected)**

* ✅ Consistent behavior without re-reading
* ✅ Less chance of “I forgot step 7”
* ❌ Larger baseline prompt (if always loaded)
* ❌ Risk of “over-applying” the skill when it’s not relevant (unless scoped well)

A good skill system usually supports **scoping**:

* Global skills (always on): safety, repo-wide conventions
* Domain skills (loaded when relevant): "PDF workflow", "spreadsheets workflow"
* Task skills (explicit invocation): `/new-task`, `/release`, `/refactor`

The Agent Skills standard formalizes this with a **progressive disclosure** model:

1. **Discovery**: Agents load only skill names and descriptions at startup (~50-100 tokens per skill)
2. **Activation**: When a task matches a skill's description, the full SKILL.md is loaded
3. **Execution**: Agents follow instructions, optionally loading referenced files or executing bundled code

This balances agent speed with contextual access—sophisticated capabilities without constant overhead.

---

### 4) Discoverability and UX: skills act like named capabilities

A README requires the user to remember:

* which file to reference
* how to phrase the request
* what the process is called

A skill gives you:

* a **name** (“task-writing”, “java-porting-plan”, “release-notes”)
* a **help surface** (slash command help text, examples)
* predictable invocation

This isn't just convenience — it affects success rate because the user doesn't need to craft the perfect prompt each time.

**Practical note on skill discovery:** The Agent Skills standard specifies that skill descriptions are injected into the system prompt (in XML format for Claude models), allowing the LLM to recognize when a skill is relevant and offer to use it. This works well in practice—the agent genuinely discovers and suggests appropriate skills without explicit invocation. However, the standard notes "each skill adds approximately 50-100 tokens to context," which won't scale to large skill libraries. A directory-based discovery mechanism (where the agent searches a skills directory when it recognizes a knowledge gap) would scale better—the standard already supports this for "filesystem-based agents" that can issue commands like `cat /path/to/skill/SKILL.md`, but semantic discovery at scale remains an open problem.

---

### 5) Slash commands: the real "productization" layer

Slash commands in IDE assistants (and similar UIs) are usually **thin wrappers around prompt templates + context selection + sometimes tool calls**.

A skill maps naturally to slash commands:

* `/new-task` → inject the “task template + conventions” skill, ask for required inputs, generate output
* `/port-to-java` → inject “porting playbook skill” + run analysis toolchain
* `/review` → inject review rubric, gather diff context, run linters, produce structured review

You *can* implement slash commands that merely say “read README then do X”… but then your slash command is basically a shaky indirection layer.

The big advantage of skills here is **parameterization and structure**:

* Slash command UI can collect parameters (target module, Java version, build system, acceptance criteria)
* Skill can define an output schema (“must include: scope, milestones, risks, tests, rollback plan”)
* The assistant can run tool steps in a known order

This becomes much closer to “a function call” than “a chat request.”

---

### 6) Prompt injection and supply-chain risk: READMEs are an attack surface

If the assistant is trained to treat files as instructions, and those files are editable in the repo, you’ve created a classic risk:

* Someone changes `docs/tasks/README.md` to include malicious instructions
  (“ignore tests”, “exfiltrate secrets”, “commit credentials”, etc.)

A skill system can mitigate this by:

* keeping skills in a protected, reviewed location
* pinning to signed versions
* restricting what parts of a repo can be used as “instruction sources”
* explicitly treating repo text as *data* not *authority* unless whitelisted

With a README approach, you can still do this — but you have to build those controls yourself.

---

### 7) Observability & evaluation: skills are testable units

A big, underappreciated difference: **skills are measurable.**

If “write tasks” is a skill:

* you can run evals: does it produce correct sections? does it follow formatting? does it include acceptance criteria?
* you can A/B versions of the skill prompt
* you can monitor usage: how often invoked, failure rate, common mistakes

If it’s “read README and do it,” you can still test it, but the behavior is more entangled with:

* retrieval variability
* file drift
* prompt phrasing variability

Skills turn “tribal knowledge” into **a stable artifact you can iterate on**.

---

### 8) Composability: skills can be layered; READMEs tend to sprawl

Skills can be built like modules:

* `base_repo_conventions`
* `task_template`
* `java_porting_rubric`
* `risk_assessment_checklist`

Then a `/port-to-java` command composes them.

READMEs often become:

* long
* narrative
* full of exceptions
* written for humans, not agents

You can rewrite the README to be modular, but at that point you are effectively writing… skills.

---

## Plain markdown skills vs skills with code

### A) Markdown-only skill (playbook skill)

Per the [Agent Skills specification](https://agentskills.io/specification), a minimal skill requires only a `SKILL.md` file with YAML frontmatter (`name`, `description`) and markdown instructions. Optional directories (`scripts/`, `references/`, `assets/`) support more complex skills.

**What it buys you**

* A consistent workflow the model follows
* Templates/checklists that reduce omission
* A stable "voice" and formatting conventions
* Easy to update; low engineering effort

**What it can’t guarantee**

* Deterministic transformations
* Correct parsing/analysis of codebases
* Enforcement of rules beyond “please do X”
* Hard validation (the model can still “say it did it”)

This is still valuable because a huge amount of coding assistant failure is:

* skipping steps
* producing wrong format
* forgetting repo conventions
* not verifying anything

A good markdown skill is basically “procedural scaffolding.”

---

### B) Skill with code (tool-backed skill)

Here the “skill” is not only instructions, but **an actual capability**: a script/CLI/library that does something deterministically.

Examples:

* parse repo and generate a module dependency graph
* extract TODOs / build a migration inventory
* run a formatter/linter and summarize diffs
* generate a task file from a structured spec
* validate that a task meets schema rules (has acceptance criteria, owner, risks, etc.)

**This is where the difference from a README becomes huge**, because:

* The model stops “imagining” results and starts *computing* results.
* The workflow becomes: **reason → call tool → verify output → write final artifact**.
* You can enforce invariants mechanically.

---

## “But we could also just put executables on PATH and tell the LLM to call them via shell.”

Yes — and that’s very close to tool-backed skills. The differences then shift to:

### 1) Interface quality: structured tool vs ad-hoc shell

If a skill exposes a tool with a typed schema (inputs/outputs), the model is less likely to:

* pass wrong flags
* mis-handle quoting/paths
* misinterpret tool output
* forget required arguments

A generic shell tool + PATH executables works, but it’s **stringly-typed** and more failure-prone.

### 2) Safety and containment

Allowing “run arbitrary executables from PATH” is a bigger attack surface than:

* a curated set of tools
* explicit allow-lists
* sandboxed execution
* read-only filesystem or restricted env vars

A mature “skill with code” system usually includes governance here.

### 3) Discoverability + docs coupling

Even if the tool exists, the model still needs:

* when to use it
* exact invocation patterns
* how to interpret outputs
* what to do on errors

Skills bundle that into a consistent recipe so the assistant doesn’t have to rediscover it every run.

### 4) Versioning

With code-backed skills you can pin:

* tool versions
* expected output formats
* compatibility with repo state

If it’s “some executable in PATH,” you can still version it, but you need discipline and tooling around it.

---

## The key distinction in one sentence

**A README is content the model *may* read and *may* apply; a skill is a packaged behavior the system is designed to *reliably* apply.**

That reliability comes from priority, invocation, structure, evaluation, and (optionally) executable tooling.

---

## When the README approach is actually good enough

Use “read README then do X” when:

* it’s a one-off or rare workflow
* you’re still figuring out the process
* the process changes often and you don’t want to maintain a skill
* you want the assistant to treat the instructions as *optional guidance*, not authoritative law
* you want minimal baseline context

In other words: ad-hoc, exploratory, low-governance scenarios.

---

## When it’s worth turning it into a skill

Turn it into a skill when:

* the workflow is repeated often (task writing, PR reviews, migrations, release steps)
* format matters (tasks must match a template)
* omissions are costly (missing acceptance criteria, missing tests, missing risk notes)
* you want a slash command UX
* you want evaluation and continuous improvement
* you want to reduce prompt injection risk from repo-editable docs
* you want deterministic steps via tools

---

## If you want the “home-build skills” to match the real benefits

If you’re designing your own system, the skill “wins” come from these mechanics:

1. **Scoped injection**

   * Skills are loaded only when relevant or explicitly invoked.
2. **Privilege control**

   * Skill instructions sit at a higher priority than random repo text.
3. **Explicit invocation surface**

   * Slash commands / command palette / UI affordance.
4. **Structured outputs**

   * Templates or JSON schemas, plus validators.
5. **Tool-backed verification**

   * If it matters, run a tool and check results.
6. **Governance**

   * Code review / signing / allow-lists for tool execution.
7. **Evals**

   * Regression tests for skill behavior.

If you implement those, you’ll find the difference between “README instructions” and “skills” becomes very real in day-to-day reliability.

---

## Applying it to your example (porting to Java task)

**README-only flow**

* User: “Read docs/tasks/README.md and write a new task about porting to Java.”
* Risks:

  * assistant misses required sections
  * assistant forgets repo-specific task metadata
  * assistant doesn’t analyze the actual codebase (unless you also tell it how)

**Skill-based flow**

* User runs: `/new-task port-to-java`
* The skill:

  * enforces the task template
  * gathers required inputs (target modules, Java version, timeline)
  * runs repo analysis tools (dependency inventory, build detection)
  * produces a task with milestones, acceptance criteria, risk register, test plan
  * optionally validates the output with a schema checker before returning it

Same "content" can live in markdown, but the system-level packaging changes outcomes.

---

## Provenance

First version generated by ChatGPT 5.2 Pro. Original prompt:

> What are SKILLS from first principles? How they differ from just asking the llm to read a file and then do something else? Like - "please read the instructions on how we work with tasks in docs/tasks/README.md and then write a new task about porting our code to java." We can put the skill instructions in the README.md file - how would that be different from loading it as a skill? Analyze it from every angle - including all affordances of the coding assistants like using the slash commands. Analyze both plain skills that have only markdown files and skills with code (I think executing the code is via shell - the llm uses a shell tool to run some executables - assume in the alternative home-build skills we can too put some executables in the search path and that the llm could use it via a shell tool).

Heavily edited since. Added references to the [Agent Skills](https://agentskills.io) open standard, practical notes on skill discovery and scaling, and editorial commentary.

**Practical experience:** We've started using skills for our tickets system (work tracking via markdown files in `tickets/`). The skill packages the directory structure, templates, and workflow into a discoverable unit. It works well—the agent recognizes when to use it and follows the process consistently.

## See Also

- [Agent Skills Standard](https://agentskills.io) — the open specification
- [Agent Skills Specification](https://agentskills.io/specification) — file format and metadata requirements
- [Example Skills Repository](https://github.com/anthropics/skills) — official examples from Anthropic
- [skills-ref](https://github.com/agentskills/agentskills/tree/main/skills-ref) — Python library for validation and prompt generation
