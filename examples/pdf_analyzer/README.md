# PDF Analyzer Example

A multi-worker document analysis system demonstrating:
- **Worker delegation** with dynamic instructions
- **Multi-zone sandbox** (input/output directories)
- **Model compatibility** requirements for vision-capable models

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    pdf_orchestrator                          │
│                    (index.worker)                            │
│                                                              │
│  1. List PDFs in input/                                      │
│  2. Classify document type                                   │
│  3. Call analyzer with:                                      │
│     - PDF file as attachment                                 │
│     - Type-specific instructions                             │
│  4. Save returned analysis to output/{name}/analysis.md     │
│                                                              │
│  [Has sandbox: input/ (ro), output/ (rw)]                   │
└─────────────────────┬───────────────────────────────────────┘
                      │ call_worker(
                      │   worker: "analyzer.worker",
                      │   attachments: ["input/doc.pdf"],
                      │   instructions: "Focus on..."
                      │ )
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                     pdf_analyzer                             │
│                    (analyzer.worker)                         │
│                                                              │
│  Receives: PDF attachment + type-specific instructions       │
│  Returns: Markdown analysis (~100 words)                     │
│                                                              │
│  [No sandbox - pure analysis, no I/O]                       │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
pdf_analyzer/
├── index.worker      # Orchestrator
├── analyzer.worker   # Analyzer with dynamic instructions
├── input/            # Place PDFs here (read-only)
│   ├── startup-pitch.pdf
│   └── research-paper.pdf
└── output/           # Analysis results (read-write)
    ├── acme-corp/
    │   └── analysis.md
    └── attention-is-all-you-need/
        └── analysis.md
```

## Setup

```bash
# Set your API key (at least one required)
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."
export GOOGLE_API_KEY="..."

# Add some PDFs to analyze
cp your-document.pdf examples/pdf_analyzer/input/
```

## Usage

```bash
# Run from the examples directory with a vision-capable model
golem-forge pdf_analyzer --model anthropic:claude-sonnet-4-20250514

# Or with OpenAI
golem-forge pdf_analyzer --model openai:gpt-4o

# Or with Google
golem-forge pdf_analyzer --model google:gemini-2.0-flash
```

## Model Compatibility

This example requires vision-capable models for PDF processing:

| Provider | Compatible Models |
|----------|------------------|
| Anthropic | `claude-sonnet-4-*`, `claude-opus-4-*` |
| OpenAI | `gpt-4o*`, `gpt-4-turbo*` |
| Google | `gemini-*-pro*`, `gemini-*-flash*` |

Using an incompatible model will result in an error:
```
Error: Model "anthropic:claude-haiku-4-5" is not compatible with worker "pdf_orchestrator".
Compatible patterns: anthropic:claude-sonnet-4-*, anthropic:claude-opus-4-*, ...
```

## Sandbox Configuration

The orchestrator has a multi-zone sandbox:

```yaml
sandbox:
  paths:
    input:
      root: "./input"
      mode: ro           # Read-only
      suffixes: [".pdf"] # Only PDF files
    output:
      root: "./output"
      mode: rw           # Read-write
```

**Key points:**
- Input is read-only to prevent accidental modification of source documents
- Output is read-write for saving analysis results
- Only `.pdf` files are accessible in the input directory
