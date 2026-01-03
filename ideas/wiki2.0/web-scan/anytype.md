# Anytype

- **Positioning:** Local-first, peer-synced “operating system for knowledge” that stores encrypted objects on user devices and only relays deltas via Anytype’s Any-sync network (Sifted profile, Jul 17 2024).
- **Why it matters for Wiki2.0:** Shows how owners can keep Markdown content + structured metadata offline while still offering polished schema editing, graph navigation, and eventual multi-user sharing.

- **Shared Spaces rollout:** November 12 2024 release introduced access-controlled spaces plus “shared objects,” moving Anytype from single-player to collaborative hubs (release notes).
- **Formulas, Relations, Widgets:** October 29 2024 release added computed properties, inline widgets, and new views (Board, Calendar) so users query structured data without leaving the doc context (release notes).
- **Chests & multi-device sync:** Shared Chests (Nov 22 2024 blog) let teams bundle collections and push them to other devices/users through encrypted packages, hinting at Git-like distribution.

## UX & Flow Notes
- Graph canvas + sidebar: Users switch between a global graph canvas and hierarchical Sets (collections) using the quick switcher.
- Objects + Types: Everything is an “Object” with a Type (schema) and Relations (properties). Templates define repeated structures (meeting notes, SOPs).
- Linking/backlinks: `@` mentions auto-create backlinks; graph view surfaces inbound/outbound links, while Relation chips show how frequently a note is referenced.
- Rich blocks: Toggle, callouts, code, galleries, Kanban boards, and canvas placements allow both linear and spatial thinking.

## Markdown & Content Model
- Markdown shortcuts for headings/lists remain, but complex Relations serialize to frontmatter-style metadata when exporting.
- Local storage persists as encrypted object store on disk, supporting version control snapshots or Git annex strategies.

## Collaboration & Governance
- Spaces now support invites with roles; edits sync via encrypted CRDT-style merges (offline-first, no single SaaS copy).
- Still lacks enterprise RBAC, retention policies, or review gates—Wiki2.0 could graft Git permissions/reviews onto this modeling flexibility.

## Hosting / Deployment
- Desktop + mobile apps across macOS/Windows/Linux/iOS/Android. Sync uses Anytype relay nodes; self-host relay support is on the roadmap but not GA.

## Distinctive Cues for Wiki2.0
- Type/Relation designer proves that editors will tolerate lightweight schema editing if the UI stays inline.
- Graph visualization is treated as a first-class navigation mode—makes a case for shipping dependency/link health dashboards with every wiki.
- Offline-first + encrypted-by-default resonates with teams that want Git-style ownership without running heavy infrastructure.

## Sources
- Sifted, “Anytype raises $13.4m…” (Jul 17 2024)
- Anytype release notes (Oct 29 2024; Nov 12 2024)
- Anytype blog “Introducing Chests” (Nov 22 2024)
