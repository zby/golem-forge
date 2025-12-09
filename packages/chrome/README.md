# @golem-forge/chrome

Chrome extension for golem-forge - AI-powered workflow automation in the browser.

## Overview

The browser extension brings golem-forge workflows to web browsers. It uses OPFS (Origin Private File System) for local storage and can sync with GitHub repositories.

## Features

- Run workers directly in the browser
- OPFS-based file sandbox (no server required)
- Side panel UI for interaction
- Site triggers for automatic worker activation
- Project management with GitHub sync (planned)

## Development

### Prerequisites

- Node.js 18+
- Chrome browser

### Build

```bash
# From monorepo root
npm install
npm run build -w @golem-forge/chrome

# Or from this directory
npm run build
```

### Development Mode

```bash
# Watch mode - rebuilds on file changes
npm run dev
```

### Load in Chrome

1. Build the extension: `npm run build`
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `packages/chrome/dist` directory

### Package Structure

```
packages/chrome/
├── src/
│   ├── background.ts      # Service worker (extension lifecycle)
│   ├── popup.tsx          # Popup UI (click extension icon)
│   ├── sidepanel.tsx      # Side panel UI (main interface)
│   ├── manifest.json      # Chrome extension manifest
│   ├── components/        # React components
│   ├── services/          # Core services
│   │   ├── ai-service.ts       # LLM API integration
│   │   ├── browser-runtime.ts  # Worker execution
│   │   ├── opfs-sandbox.ts     # OPFS file operations
│   │   ├── project-manager.ts  # Project management
│   │   └── worker-manager.ts   # Worker loading
│   ├── storage/           # Chrome storage utilities
│   ├── ui/                # UI utilities
│   └── workers/           # Bundled worker definitions
├── vite.config.ts         # Build configuration
└── package.json
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Browser Extension                       │
│                                                          │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  Popup   │  │  Side Panel  │  │    Background    │  │
│  │   UI     │  │     UI       │  │  Service Worker  │  │
│  └────┬─────┘  └──────┬───────┘  └────────┬─────────┘  │
│       │               │                    │            │
│       └───────────────┴────────────────────┘            │
│                       │                                  │
│              ┌────────┴────────┐                        │
│              │   Core Engine   │                        │
│              │                 │                        │
│              │ ProjectManager  │                        │
│              │ WorkerManager   │                        │
│              │ BrowserRuntime  │                        │
│              │ OPFSSandbox     │                        │
│              └────────┬────────┘                        │
│                       │                                  │
└───────────────────────┼──────────────────────────────────┘
                        │
           ┌────────────┴────────────┐
           │                         │
           ▼                         ▼
    ┌─────────────┐          ┌─────────────┐
    │   LLM APIs  │          │ GitHub API  │
    │  (Anthropic │          │  (planned)  │
    │   OpenAI)   │          │             │
    └─────────────┘          └─────────────┘
```

## Configuration

API keys are configured in the extension's settings panel:

1. Click the extension icon or open the side panel
2. Go to Settings tab
3. Enter your API keys (Anthropic, OpenAI, Google)
4. Select default model

## See Also

- [Main README](../../README.md) - Project overview and concepts
- [Browser Extension Architecture](../../docs/browser-extension-architecture.md) - Detailed architecture
- [@golem-forge/core](../core/) - Shared types and utilities
- [@golem-forge/cli](../cli/) - CLI tool
