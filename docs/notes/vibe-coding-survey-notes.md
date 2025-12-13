# Notes: A Survey of Vibe Coding with Large Language Models

**Paper**: https://arxiv.org/abs/2510.12399
**Authors**: Ge et al.
**Date reviewed**: 2025-12-13

## Summary

"Vibe Coding" = development paradigm where developers validate AI-generated code through outcome observation rather than line-by-line review. The survey analyzes 1000+ papers and formalizes the approach as a Constrained Markov Decision Process.

Key finding: "empirical evidence reveals unexpected productivity losses" - experienced developers using Cursor with Claude experienced **19% increased completion time**. Success requires infrastructure and collaboration patterns, not just better LLMs.

## Five Development Models

1. **Unconstrained Automation Model (UAM)** - minimal human intervention, well-defined tasks
2. **Iterative Conversational Collaboration Model (ICCM)** - tight human-agent feedback loops
3. **Planning-Driven Model (PDM)** - upfront task decomposition guides execution
4. **Test-Driven Model (TDM)** - test specifications precede implementation
5. **Context-Enhanced Model (CEM)** - rich project context informs decisions

## Agent Architecture (Three Layers)

- **Human Layer**: System instructions and task requirements
- **Project Layer**: Codebase, database, domain knowledge
- **Agent Layer**: Tool definitions, historical memory, task queues

## Five Core Agent Capabilities

1. Decomposition/planning
2. Memory mechanisms
3. Action execution
4. Reflection (iteration/validation)
5. Collaboration with other agents

## Key Recommendations

### Tool Use & Capability Restriction
- Bounded tool access with constrained action space
- Security isolation mechanisms
- Containerization technologies prevent uncontrolled behavior

### Context Management
- Retrieval mechanisms within token limits
- Filtering and ranking of relevant artifacts
- Dynamic context assembly
- "Successful Vibe Coding depends not merely on agent capabilities but on systematic context engineering"

### Infrastructure Components
1. **Isolated Execution Runtime** - containerization, sandboxing, security boundaries
2. **Interactive Development Interface** - LSP, standard protocols
3. **Distributed Orchestration Platform** - CI/CD, multi-agent coordination

### Multi-Agent Patterns
- "Specialized roles across the development process"
- "Distinct programmer, test designer, and test executor agents"
- Role-based division of labor

## Relevance to Worker Proposal

| Survey Insight | Worker Design |
|----------------|---------------|
| Role-based division of labor | Workers as specialized agents (reviewer, analyzer, etc.) |
| Bounded tool access | `tools:` field restricts capabilities |
| Planning-driven model | WORKER.md defines contract upfront |
| Context management challenge | Fresh context per worker, explicit task passing |
| Isolated execution runtime | RPC subprocess, future sandboxing |
| 19% productivity loss warning | Pre-defined workers vs ad-hoc sub-agents |

## Quotes Worth Remembering

> "Successful Vibe Coding depends not merely on agent capabilities but on systematic context engineering."

> "Experienced developers using Cursor with Claude experienced 19% increased completion time"

> "Feedback mechanisms spanning compiler feedback, execution feedback, human feedback, and self-refinement should integrate into agent loops"
