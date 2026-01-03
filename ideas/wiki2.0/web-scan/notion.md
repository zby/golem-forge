# Notion

## Snapshot
- **Positioning:** Notion 3.0 reframes the workspace as an AI-agent platform where autonomous Agents can read/write docs, databases, and connected tools with explicit instruction pages and long-running memory (Notion release, Sep 18 2025).
- **Why it matters for Wiki2.0:** Sets user expectation that modern wikis expose programmable surfaces (Agents, MCP connectors, row-level permissions) without sacrificing block-level editing.

## 2025 Releases & Signals
- **Agents everywhere:** Personal Agents now execute up to ~20 minutes of multi-step work (database updates, doc drafting). Custom Agents (rolling out) will run on schedules/triggers for teams (Notion 3.0 release + blog, Sep 18 2025).
- **Governance upgrades:** Database row-level permissions shipped alongside Agents, letting admins control access per record without building new tables—key for sensitive runbooks (Notion release, Sep 18 2025).
- **Connectors + MCP:** AI connectors bring Slack, Gmail, Box context into the workspace, while Notion’s Model Context Protocol endpoints let IDEs or other tools fetch/write wiki context safely (Notion release, Sep 18 2025).
- **Multi-surface push:** Notion Mail (public beta Oct 24 2024) and new forms keep inboxes and capture native, so the wiki stays the system-of-record for conversations and structured inputs (Notion Mail announcement, Oct 24 2024).
- **Release cadence:** Notion’s public changelog highlights ongoing Agent improvements such as CSV ingestion, map view, and Gemini 3 Pro access, teaching buyers to expect weekly AI upgrades (Notion release feed, Nov–Dec 2025).

## UX & Flow Notes
- Persistent sidebar tree + quick search palette remain default navigation; Agent tasks surface as inbox items, reinforcing “docs as workflows.”
- Slash-menu block editor normalizes inline databases, synced blocks, and AI actions; editors assume they can run `/summarize` or `/ask agent` per block.
- Backlink panel and `@` mentions tie together docs, tasks, databases, and people; row chips and filters imply metadata belongs alongside prose.

## Markdown & Content Model
- Markdown import/export works but complex database logic still leaks; Agents fill gaps by transforming content (formulas, property mass edits) so metadata stays normalized (Notion 3.0 release, Sep 18 2025).
- Inline properties behave like frontmatter surfaced in-place—expectation for Wiki2.0 UI that still commits YAML to Git.

## Collaboration & Governance
- Block-level presence, inline comments, and named page versions are table stakes; new Agent instruction pages add meta-governance (who may run what, with which data).
- Custom Agents promise scheduled automations; reviewers remain gatekeepers through share settings + version history snapshots users can diff.

## Hosting / Deployment
- Fully managed SaaS with enterprise SSO/SCIM; connectors pull from external systems but content ultimately lives in Notion’s cloud—helpful contrast for teams needing self-host + Git histories.

## Distinctive Cues for Wiki2.0
- **Instruction pages:** Agent “memory” pages double as living SOPs; Wiki2.0 can borrow this by storing agent playbooks next to policies and requiring approvals on edits.
- **Row-level controls:** Expectation that metadata objects inside a page obey access policies; Git-backed implementations should plan field-level ACLs or encrypted blobs.
- **AI connectors:** Users will ask whether bots can cite Slack/email context automatically; plan safe retrieval pipelines plus provenance UI.

## Sources
- Notion 3.0 launch notes & changelog (September–December 2025)
- Notion blog “Introducing Notion 3.0” (September 18 2025)
- Notion Mail preview announcement (October 24 2024)
