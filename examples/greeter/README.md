# Greeter Example

A minimal conversational worker demonstrating basic golem-forge usage. No tools, no sandbox—just a friendly chat agent.

## Quick Start

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export GOLEM_FORGE_MODEL="anthropic:claude-haiku-4-5"

golem-forge greeter "Hello, how are you today?"
```

## More Examples

```bash
# Run from within the worker directory
cd examples/greeter
golem-forge . "Hello, how are you today?"

# Try different prompts
golem-forge greeter "Tell me a joke"
```

## Worker Definition

See `index.worker`:

```yaml
name: greeter
description: A friendly assistant that greets users and responds to messages
model: anthropic:claude-haiku-4-5
```

**Key points:**
- Simple conversational agent
- No tools or sandbox needed
- Model can be set via `GOLEM_FORGE_MODEL` environment variable
- Instructions in markdown body
