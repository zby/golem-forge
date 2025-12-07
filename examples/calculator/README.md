# Calculator Example

A mathematical calculator assistant that performs calculations using LLM reasoning.

## Quick Start

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export GOLEM_FORGE_MODEL="anthropic:claude-haiku-4-5"

golem-forge calculator "What is the 20th Fibonacci number?"
```

## More Examples

```bash
golem-forge calculator "Calculate 12 factorial"
golem-forge calculator "Find the prime factors of 360"
```

## Features

- Basic arithmetic operations
- Fibonacci number calculations
- Factorial calculations
- Prime factorization
- Step-by-step explanations
- Optionally saves results to scratch files

## Notes

This example demonstrates:
- A worker that relies on LLM reasoning capabilities
- Using filesystem tools for optional scratch work
- Clear, instructional prompting for mathematical tasks

Unlike a version with custom tools, this relies on the LLM's inherent ability to perform calculations. For very large numbers or complex operations, the LLM may have accuracy limitations.
