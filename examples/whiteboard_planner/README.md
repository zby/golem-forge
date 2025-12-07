# Whiteboard Planner Example

Convert whiteboard photos into structured project plans using image analysis and worker delegation.

## Quick Start

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
export GOLEM_FORGE_MODEL="anthropic:claude-haiku-4-5"

# Add whiteboard photos to input/
cp your-whiteboard.png input/

# Run the orchestrator
golem-forge whiteboard_planner "Process all whiteboards"

# Check output
cat plans/your-whiteboard.md
```

## Features

- Batch process multiple whiteboard images
- Delegate to specialized analyzer worker for image interpretation
- Generate markdown project plans with structure:
  - Epics and workstreams
  - Prioritized tasks with dependencies
  - Timeline and milestones
  - Risks and open questions

## Project Structure

```
whiteboard_planner/
  index.worker                    # Orchestrator
  workers/
    whiteboard_analyzer.worker    # Image analysis sub-worker
  input/                          # Put whiteboard images here (read-only)
  plans/                          # Generated plans saved here (read-write)
```

## Model Compatibility

Requires a vision-capable model:
- `anthropic:claude-haiku-4-5` or later Claude models
- `openai:gpt-4o` or `gpt-4-turbo`
- `google:gemini-1.5-pro` or `gemini-1.5-flash`

## Notes

This example demonstrates:
- **Worker delegation**: Orchestrator delegates to specialized analyzer
- **Image attachments**: Passing images to vision-capable models
- **Attachment policies**: Restricting file types and sizes
- **Model compatibility**: Requiring vision-capable models
- **Batch processing**: Processing multiple files in a workflow
