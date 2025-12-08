# Ink Adoption Plan

Plan for adopting [Ink](https://github.com/vadimdemedes/ink) as the terminal UI framework for golem-forge.

## Architecture Context

The `UIAdapter` interface (`src/ui/adapter.ts`) provides platform-independent UI abstraction:

```
┌─────────────────────────────────────────────────────┐
│                   UIAdapter Interface               │
│  (displayMessage, requestApproval, showProgress...) │
└─────────────────────────────────────────────────────┘
            │                          │
            ▼                          ▼
┌───────────────────────┐    ┌───────────────────────┐
│     CLIAdapter        │    │    BrowserAdapter     │
│   (Ink + React)       │    │   (React DOM)         │
│                       │    │                       │
│  Terminal-specific    │    │  Browser-specific     │
│  - ANSI colors        │    │  - HTML/CSS           │
│  - Flexbox via Yoga   │    │  - DOM events         │
│  - Raw mode input     │    │  - Web APIs           │
└───────────────────────┘    └───────────────────────┘
```

**Key insight**: Ink is specifically for CLI richness. It doesn't help browser implementation - that needs React DOM anyway. The `UIAdapter` interface is the right abstraction for sharing logic between platforms.

## Background

### Current State
- `CLIAdapter` in `src/ui/cli-adapter.ts` uses raw readline + picocolors
- Simple but limited: no layout system, manual ANSI codes, basic input handling
- ~700 lines of imperative code

### Why Ink for CLI?
- **Battle-tested**: 33k GitHub stars, used by Claude Code, GitHub Copilot CLI, Shopify CLI
- **React patterns**: Component-based, familiar to most developers
- **Flexbox layouts**: CSS-like terminal layouts via Yoga
- **Rich ecosystem**: [@inkjs/ui](https://github.com/vadimdemedes/ink-ui) provides pre-built components
- **Node.js native**: No Bun/Zig dependencies (unlike OpenTUI)
- **CLI-specific**: Optimized for terminal rendering, not browser

### Prototype Validation
See `experiments/ink-ui-prototype/` for working prototype demonstrating:
- Message display with styled boxes
- Interactive approval prompts with keyboard navigation
- Progress tracking with nested tasks
- Tool result rendering
- Diff display

## What's Shared vs Platform-Specific

| Layer | Shared | CLI (Ink) | Browser (React DOM) |
|-------|--------|-----------|---------------------|
| **Interface** | `UIAdapter` | - | - |
| **Types** | `Message`, `UIApprovalRequest`, `TaskProgress`, etc. | - | - |
| **Logic** | Approval flow, progress tracking, result formatting | - | - |
| **Rendering** | - | Ink components, ANSI | React components, CSS |
| **Input** | - | Raw mode, readline | DOM events |
| **Layout** | - | Yoga flexbox | CSS flexbox |

The `UIAdapter` interface ensures both implementations handle the same operations, while rendering is completely platform-specific.

## Adoption Strategy

### Phase 1: Parallel Implementation
**Goal**: Create `InkAdapter` alongside `CLIAdapter` without breaking existing functionality.

1. Add dependencies to main package.json:
   ```json
   {
     "ink": "^6.0.0",
     "@inkjs/ui": "^2.0.0",
     "react": "^19.0.0"
   }
   ```

2. Create `src/ui/ink/` directory structure:
   ```
   src/ui/ink/
   ├── index.ts
   ├── InkAdapter.tsx
   └── components/
       ├── Message.tsx
       ├── ApprovalPrompt.tsx
       ├── Progress.tsx
       ├── ToolResult.tsx
       └── DiffView.tsx
   ```

3. Export both adapters from `src/ui/index.ts`:
   ```typescript
   export { CLIAdapter, createCLIAdapter } from "./cli-adapter.js";
   export { InkAdapter, createInkAdapter } from "./ink/index.js";
   ```

### Phase 2: Feature Flag Integration
**Goal**: Allow runtime selection between adapters.

1. Add configuration option:
   ```yaml
   # golem-forge.config.yaml
   ui:
     adapter: "ink"  # or "cli" for legacy
   ```

2. Add CLI flag:
   ```bash
   golem-forge run worker.worker --ui=ink
   golem-forge run worker.worker --ui=cli
   ```

3. Auto-detect TTY capability:
   ```typescript
   function selectAdapter(): UIAdapter {
     if (!process.stdin.isTTY) {
       return createCLIAdapter();  // Fallback for non-TTY
     }
     return config.ui?.adapter === "cli"
       ? createCLIAdapter()
       : createInkAdapter();
   }
   ```

### Phase 3: Enhanced Components
**Goal**: Add features not possible with raw readline.

1. **Spinner/Progress Bar**
   - Use `@inkjs/ui` Spinner component
   - Add progress percentage for long operations

2. **Scrollable History**
   - Keep message history in React state
   - Allow scrolling through past messages

3. **Split Panes**
   - Show task tree on left, output on right
   - Real-time updates without clearing screen

4. **Syntax Highlighting**
   - Highlight code blocks in assistant messages
   - Colorize diff output

5. **Command Palette**
   - Fuzzy-searchable command list
   - Similar to VS Code's Cmd+P

### Phase 4: Deprecate CLIAdapter
**Goal**: Make Ink the default, keep CLI as minimal fallback.

1. Make `InkAdapter` the default
2. Reduce `CLIAdapter` to essential output-only mode
3. Update documentation

## Migration Considerations

### Breaking Changes
- React 19 required (Ink 6.x dependency)
- Bundle size increases (~500KB for ink + react)
- Node.js 18+ required

### Compatibility
- Keep `CLIAdapter` for:
  - Non-TTY environments (CI/CD, pipes)
  - Minimal/headless deployments
  - Users who prefer simpler output

### Testing Strategy
1. Unit tests for components (already have patterns from prototype)
2. Integration tests using Ink's testing utilities
3. Manual testing for interactive features

## Timeline Estimate

| Phase | Scope | Effort |
|-------|-------|--------|
| Phase 1 | Parallel implementation | 2-3 days |
| Phase 2 | Feature flags & detection | 1 day |
| Phase 3 | Enhanced components | 3-5 days |
| Phase 4 | Default switch & docs | 1 day |

## Open Questions

1. **React version**: React 19 is new - any compatibility concerns with other tooling?

2. **Bundle size**: Is ~500KB acceptable for CLI tool? Could use dynamic import to lazy-load.

3. **Testing in CI**: How to test interactive components in CI environment?

4. **Streaming output**: How does Ink handle streaming LLM responses? May need custom component.

## References

- Prototype: `experiments/ink-ui-prototype/`
- Ink docs: https://github.com/vadimdemedes/ink
- Ink UI components: https://github.com/vadimdemedes/ink-ui
- Current CLIAdapter: `src/ui/cli-adapter.ts`
- UIAdapter interface: `src/ui/adapter.ts`
