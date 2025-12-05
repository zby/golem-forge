# Greeter Example

A minimal conversational worker demonstrating basic golem-forge usage. No tools, no sandbox—just a friendly chat agent.

## Setup

```bash
# Set your API key
export ANTHROPIC_API_KEY="sk-ant-..."
```

## Usage

```bash
cd examples/greeter

# Run the worker with a message
npx golem-forge main "Hello, how are you today?"

# Or with a different model
npx golem-forge main "Tell me a joke" --model openai:gpt-4o-mini
```

## Worker Definition

See `main.worker`:

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
