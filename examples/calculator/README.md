# Calculator Example

A mathematical calculator assistant that performs calculations using LLM reasoning.

## Features

- Basic arithmetic operations
- Fibonacci number calculations
- Factorial calculations
- Prime factorization
- Step-by-step explanations
- Optionally saves results to scratch files

## Usage

```bash
cd examples/calculator
npx golem-forge . "What is the 20th Fibonacci number?"
npx golem-forge . "Calculate 12 factorial"
npx golem-forge . "Find the prime factors of 360"
```

## Notes

This example demonstrates:
- A worker that relies on LLM reasoning capabilities
- Using filesystem tools for optional scratch work
- Clear, instructional prompting for mathematical tasks

Unlike a version with custom tools, this relies on the LLM's inherent ability to perform calculations. For very large numbers or complex operations, the LLM may have accuracy limitations.
