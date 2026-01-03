# Obsidian Publish

## Snapshot
- **Positioning:** Selective publishing layer for Obsidian vaults—authors edit Markdown locally, then push chosen notes to a managed, SSL-backed site with custom domains, search, and graph navigation.
- **Why it matters for Wiki2.0:** Proves teams want Git/local-first authoring with hosted distribution, and expect Publish to expose backlinks, graph view, and custom styling without leaving Markdown.

## 2024–2025 Releases & Signals
- **Full-text search + graph defaults:** Official docs emphasize Publish’s automatic search index, local graph, and backlink panes (updated May 2024). Readers now expect link-aware browsing as baseline. (Obsidian Publish help docs)
- **Custom theming explosion:** Flowershow plugin (Mar 2024) turns Obsidian themes/snippets into Publish templates, showing demand for programmable skinning. (Flowershow announcement, Mar 13 2024)
- **Pricing shift:** As of Feb 9 2025, Obsidian removed the “non-commercial” restriction—making it easier for small teams to run wikis locally and publish externally. (Obsidian blog “Obsidian is now free for work”)

## UX & Flow Notes
- Authors work offline inside Obsidian, use Publish plugin to select files/folders, review diffs, and push updates. This gating mirrors Git PR flows: nothing ships automatically.
- Readers get sidebar navigation, page tree, backlinks, outgoing links, and visual graph. Custom landing pages crafted via Markdown or HTML snippets.
- Publish supports file embeds, callouts, DataView-rendered tables, and page aliases; frontmatter drives ordering, tags, and permalinks.

## Collaboration & Governance
- Collaboration handled outside Publish (shared vault via Git, Obsidian Sync, or third-party storage). Publish itself exposes history logs and optional password protection but no inline comments.
- Teams rely on Git for review + merge, then use Publish for deployment. Suggests Wiki2.0 should integrate preview environments + publish toggles.

## Hosting / Deployment
- Managed SaaS: CDN, SSL, custom domains, per-site subscription. Supports unpublished drafts, manual reverts, site-wide snippets, and asset hosting.

## Distinctive Cues for Wiki2.0
- **Selective publish:** Being able to stage/deselect files before pushing is non-negotiable for teams mixing private drafts + public docs.
- **Custom CSS/snippets:** Users expect to inject JS/CSS to brand docs; Wiki2.0 could expose component-based theming or CSS variables.
- **Graph/backlink UI:** Setting expectation that visitors should “see the network” rather than linear trees; plan similar graph view or link-health overlay.

## Sources
- Obsidian Publish help doc “Publish at scale” (May 2024)
- Obsidian blog “Obsidian is now free for work” (Feb 9 2025)
- Obsidian blog “Announcing the Flowershow plugin for Obsidian Publish” (Mar 13 2024)
