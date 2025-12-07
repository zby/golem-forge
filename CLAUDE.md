# Instructions for Claude and AI Assistants

Read and follow all guidance in `AGENTS.md`.

## Working Directory

The working directory is always `/home/zby/llm/golem-forge`. Use simple commands without `-C` flags:
- Use `git diff` not `git -C /home/zby/llm/golem-forge diff`
- Use `git status` not `git -C /home/zby/llm/golem-forge status`

## Documentation Examples

When writing examples that use live models:
- Use `anthropic:claude-haiku-4-5` as the primary model (cost-effective)
- Include `openai:gpt-4o-mini` as an alternative
- README examples should always show execution with live models, not placeholders
