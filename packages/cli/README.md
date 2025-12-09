# @golem-forge/cli

CLI tool and Node.js runtime for golem-forge - composable LLM workflows using workers.

## Installation

```bash
npm install @golem-forge/cli
```

Or run directly with npx:

```bash
npx golem-forge ./my-program "input message"
```

## Usage

### Running Programs

```bash
# Run a program (finds main.worker in directory)
npx golem-forge ./my-program "input message" --model anthropic:claude-haiku-4-5

# Run with different entry point
npx golem-forge ./my-program --entry analyzer "input" --model anthropic:claude-haiku-4-5

# Run single worker file directly
npx golem-forge ./standalone.worker "input" --model anthropic:claude-haiku-4-5

# Override config at runtime
npx golem-forge ./my-program "input" --model anthropic:claude-sonnet-4 --set locked=true
```

### Attach Files

```bash
npx golem-forge ./examples/greeter --attach assets/spec.png "Describe this image"
```

### Create New Program

```bash
npx golem-forge init my-program
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | API key for Anthropic models |
| `OPENAI_API_KEY` | API key for OpenAI models |
| `GOOGLE_GENERATIVE_AI_API_KEY` | API key for Google models |
| `GOLEM_FORGE_MODEL` | Default model (e.g., `anthropic:claude-haiku-4-5`) |

## Programmatic API

```typescript
import {
  // Approval system
  ApprovalPolicy,
  ApprovalRequired,

  // Tool execution
  createApprovedTools,

  // Worker definitions
  loadWorkerDefinition,
  WorkerDefinition,

  // UI abstraction
  CLIAdapter,
  createCLIAdapter,
} from '@golem-forge/cli';
```

## Package Structure

```
packages/cli/
├── src/
│   ├── index.ts          # Main library exports
│   ├── ai/               # AI SDK integration
│   ├── approval/         # Approval system
│   ├── cli/              # CLI entry point
│   ├── config/           # Configuration loading
│   ├── runtime/          # Worker execution runtime
│   ├── sandbox/          # Filesystem sandbox
│   ├── tools/            # Tool definitions
│   ├── ui/               # UI abstraction layer
│   └── worker/           # Worker loading and parsing
├── tests/                # Integration tests
└── package.json
```

## Development

```bash
# Build
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Run integration tests (requires API keys)
npm run test:integration

# Run live tests (actually calls LLMs)
npm run test:live
```

## See Also

- [Main README](../../README.md) - Project overview and concepts
- [@golem-forge/core](../core/) - Shared types and utilities
- [@golem-forge/browser](../browser/) - Browser extension
