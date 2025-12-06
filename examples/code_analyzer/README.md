# Code Analyzer Example

A code analysis assistant that explores and analyzes codebases using filesystem tools.

## Features

- Explore project structure with glob patterns
- Read and analyze source files
- Generate detailed analysis reports
- Count files, find patterns, identify entry points

## Usage

```bash
cd examples/code_analyzer
# Put code to analyze in the codebase/ directory, then:
npx golem-forge . "Analyze the project structure"
npx golem-forge . "Count all TypeScript files and summarize their purposes"
npx golem-forge . "Find configuration files and explain their settings"
```

## Sandbox Structure

```
code_analyzer/
  index.worker      # Worker definition
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
