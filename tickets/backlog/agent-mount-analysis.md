# Analyze Container Mount Requirements

## Idea
Document what host directories to mount in agent containers: which are required, which are useful, and what each provides.

## Why
Mounting the right directories improves the container experience:
- **Auth**: Agents work without re-login
- **Settings**: Consistent behavior between host and container
- **History/Context**: Agents remember previous sessions
- **Cache**: Faster startup, avoid re-downloading

Currently we mount different amounts per agent without clear documentation of what each provides.

## Current Mounts

**AI Agents:**
```yaml
# Claude Code (5 directories)
- ~/.claude
- ~/.claude.json
- ~/.local/share/claude
- ~/.local/state/claude
- ~/.cache/claude

# Codex (1 directory)
- ~/.codex

# Gemini (1 directory)
- ~/.gemini
```

**Other potential mounts to consider:**
```yaml
# Editor config
- ~/.vimrc
- ~/.config/nvim

# Shell config (aliases, functions)
- ~/.bashrc (or parts of it)

# Git config (user, aliases, excludes)
- ~/.gitconfig

# SSH known_hosts (avoid prompts for new hosts)
- ~/.ssh/known_hosts
```

## Scope
1. For each AI agent:
   - Test minimal mounts for auth
   - Document directory contents and purpose
   - Categorize: required | useful | optional
2. Consider non-agent mounts that improve container UX
3. Update compose.yaml with organized sections and comments
4. Document findings in agents-in-docker.md

## Categories to Document

| Category | Purpose | Examples |
|----------|---------|----------|
| Auth | Login without re-auth | credentials, tokens |
| Settings | Consistent behavior | preferences, themes |
| History | Context from past sessions | command history, project memory |
| Cache | Performance | downloaded models, compiled assets |

## Why Not Now
Current setup works. This is optimization/documentation.

## Trigger to Activate
- When simplifying or expanding the Docker setup
- When adding new AI agents
- When users ask what to mount
