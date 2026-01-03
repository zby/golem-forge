# Outline

## Snapshot
- **Positioning:** API-first team wiki with nested “collections,” Slack-native capture, and both managed cloud + open-source self-host.
- **Why it matters for Wiki2.0:** Demonstrates how RBAC, real-time mentions, and automation hooks can coexist with approachable WYSIWYG editing.

## 2024–2025 Releases & Signals
- **Document Mentions (Aug 5 2024):** Real-time `@` mentions notify referenced docs and insert backlinks automatically—Outline now nudges doc owners when other teams cite them (blog post).
- **Collection Subscriptions (Apr 10 2025):** Users can “follow” a collection to get digest emails/slack updates whenever docs change—freshness telemetry by folder (release announcement).
- **Open-source cadence:** Recent releases (v0.76–0.78) add slash-menu GIF search, Doc Heatmap, and upgraded editor; indicates active OSS momentum for self-host adopters (GitHub releases).

## UX & Flow Notes
- Sidebar organizes collections + nested sub-collections; command palette + `/outline` Slack command give quick search.
- ProseMirror editor with Markdown shortcuts, slash menu, templates, and cover icons/headings.
- Backlink chips (“Referencing documents”) plus inline Document Mentions show context; auto-generated ToC for deep docs.
- Inline comments, suggestions, and tasks keep editing close to reading experience; watchers get updates via email/Slack.

## Markdown & Content Model
- Markdown import/export; API returns structured JSON with metadata (title, collection, parent). Templates mimic frontmatter fields like status or owner.
- Slash menu exposes components (callouts, columns, code, embeds) while still storing text as structured nodes (easier for diff review).

## Collaboration Mechanics
- Role-based permissions (admin/member/guest) enforced per collection; shareable links with expiry. Slack + email notifications tie into review flow.
- Version history and optional “require review” settings align with compliance-heavy teams. API/webhooks enable automation (LLM agents, CI bots).

## Hosting / Deployment
- Managed cloud (SOC2, SAML, SCIM). OSS edition runs via Docker/Postgres/Redis; regular release cadence ensures parity.

## Distinctive Features to Note
- Slack-first capture/unfurl reduces friction, showing how wiki context can follow conversations automatically.
- Collection subscriptions show interesting approach to doc health notifications without complex analytics.
- API + webhooks allow hooking LLM agents into doc creation, review, or mirroring flows.

## Opportunities for Wiki2.0
- Collection-level review requirements map nicely to guarded namespaces (e.g., `/policy`); can inspire Git branch protection analog.
- Slack-driven capture hints at multi-surface input (agents can capture context from chat, convert into docs via API).
- Outline’s API-first design shows path for hooking LLM workers into wiki governance pipeline.

## Sources
- Outline blog “Document Mentions” (Aug 5 2024)
- Outline blog “Collection subscriptions” (Apr 10 2025)
- Outline GitHub releases v0.76–0.78 (2024–2025)
