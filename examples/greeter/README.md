# Greeter Example

A minimal conversational worker demonstrating basic golem-forge usage. No tools, no sandbox—just a friendly chat agent.

## Setup

```bash
# Set your API key
export ANTHROPIC_API_KEY="sk-ant-..."
```

## Usage

```bash
# Run from the examples directory
golem-forge greeter "Hello, how are you today?"

# Or from within the worker directory
cd examples/greeter
golem-forge . "Hello, how are you today?"

# With a different model
golem-forge greeter "Tell me a joke" --model openai:gpt-4o-mini
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
- Model specified in worker (can be overridden with `--model`)
- Instructions in markdown body
