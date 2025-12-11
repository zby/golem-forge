# Code Analyzer Example

A code analysis assistant that explores and analyzes codebases using filesystem tools.

## Quick Start

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export GOLEM_FORGE_MODEL="anthropic:claude-haiku-4-5"

# Put code to analyze in the codebase/ directory, then:
golem-forge code_analyzer "Analyze the codebase structure"
```

## More Examples

```bash
golem-forge code_analyzer "Count all TypeScript files and summarize their purposes"
golem-forge code_analyzer "Find configuration files and explain their settings"
```

## Features

- Explore codebase structure with glob patterns
- Read and analyze source files
- Generate detailed analysis reports
- Count files, find patterns, identify entry points

## Sandbox Structure

```
code_analyzer/
  main.worker       # Worker definition
  codebase/         # Put code here to analyze (read-only)
  reports/          # Analysis reports are saved here (read-write)
```

## Notes

This example demonstrates:
- Read-only sandbox zones for safe code analysis
- Using `list_files` with glob patterns for file discovery
- Generating reports to a separate output zone
- A systematic analysis workflow

The original llm-do example used shell commands (grep, find, wc). This version uses filesystem tools which are safer and more portable.
