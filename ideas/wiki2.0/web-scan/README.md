# Wiki2.0 Web Scan (updated January 3, 2026)

Desk research across lightweight wikis/knowledge bases and “Wiki 2.0/agents” articles. Output: per-tool field notes plus synthesized themes to guide Wiki2.0 planning.

## Source Index
| Source | Why we care |
| --- | --- |
| [Notion](./notion.md) | Agents, row-level permissions, MCP connectors set expectations for programmable wikis. |
| [Anytype](./anytype.md) | Local-first, schema-rich modeling with encrypted sync for self-host or air-gapped teams. |
| [Supernotes](./supernotes.md) | Atomic cards + spaced repetition + AI “Superpowers” showcase upkeep loops for knowledge atoms. |
| [Obsidian Publish](./obsidian-publish.md) | Markdown-first authoring with selective publish; demonstrates private editing + hosted mirrors. |
| [Outline](./outline.md) | Open-source team wiki with active changelog (doc mentions, collection subscriptions, Helm charts). |
| [Slab](./slab.md) | Opinionated editorial workflow, Insights dashboard, and Knowledge Request intake. |
| [ClickUp](./clickup.md) | AI-first knowledge base blending Docs, imports, and @Brain agents inside PM workflows. |
| [Wiki / Agents Articles](./wiki-agents-articles.md) | ServiceNow Knowledge Center, Wikimedia vector APIs, ClickUp + TechCrunch coverage of AI-ready wikis. |

## 2025 Observations
- **AI-native editing:** Notion Agents, ClickUp Brain/Super Agents, and ServiceNow Knowledge Center show buyers expect agents to read, cite, and draft wiki updates with governance (row-level ACLs, verified wikis, knowledge centers).
- **Ownership spectrum:** Anytype + Obsidian keep Markdown + frontmatter locally, while Outline/Slab/ClickUp run managed SaaS with APIs/webhooks and selective self-host hooks (Outline Helm charts, Obsidian Publish via git).
- **Health dashboards:** Slab Insights, ClickUp Docs Hub, and ServiceNow Knowledge Center foreground freshness, duplicates, and ownership metrics—Wiki2.0 needs native telemetry plus automation hooks.
- **Notification primitives:** Outline collection subscriptions, document mentions, and ClickUp @Brain mentions highlight expectation for push-based change feeds (email, Slack, inbox) derived from metadata.
- **Link graphs in UI:** Obsidian Publish graph view, Supernotes backlink tables, and Outline link mentions push the idea that a wiki is navigated via references, not just sidebar trees.

## Gaps & design prompts
- **Diff + realtime parity:** None of the surveyed tools merge Git-style diff approvals with block editors; opportunity for Wiki2.0 to keep Markdown diffs under the hood while providing collaborative cursors/annotations up top.
- **Agent guardrails:** Even AI-forward tools lack first-class “propose diff + attach sources + cite dataset” pipelines; we can differentiate with structured review queues for humans + bots.
- **Policy namespaces:** Outline/Slab support RBAC by collection/topic, but few tools ship immutable policy bundles or signed snippets for agent consumption—build `/policy` and `/kb` lanes with branch protection.
- **Structured metadata exposure:** Databases (Notion), relations (Anytype), card properties (Supernotes), and Doc Hub filters (ClickUp) reinforce the need for inline property panels mapped to Git frontmatter.

## Opportunities for Wiki2.0
1. **Agent-aware publishing:** Provide programmable instruction pages + review queues (inspired by Notion Agents, ClickUp Super Agents, ServiceNow Knowledge Center) so LLMs can request edits, cite sources, and await approval.
2. **Hybrid local/cloud model:** Pair Git/Markdown storage (Obsidian/Anytype) with hosted mirrors + selective publish toggles (Obsidian Publish) for sharing curated slices.
3. **Telemetry-driven upkeep:** Ship Insights dashboards and RSS/webhook feeds that highlight stale docs, orphaned links, and policy drift—mirroring Slab Insights + Outline subscriptions.
4. **Graph-first navigation:** Expose backlink maps/backbone graphs by default, as readers from Supernotes/Obsidian/Outline now expect network context.
5. **Metadata-first UI:** Surface frontmatter fields inline (status, owner, freshness) like Notion databases or Anytype relations, and keep them machine-readable for agents.

## Share-out
- Treat this README as the index for Wiki2.0 planning docs. Link it in the next roadmap sync and reference specific tool notes (above) plus [wiki-agents-articles.md](./wiki-agents-articles.md) when discussing AI governance.
