# AI SDK Browser Validation Experiment

**Status:** Proposed
**Purpose:** Validate Vercel AI SDK compatibility in Chrome extension environment before Phase 1 implementation

## Prerequisites

### System Requirements (Ubuntu Linux)

```bash
# Node.js 18+ (required by Golem Forge)
node --version  # Should be v18.0.0 or higher

# If not installed, use nvm:
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
```

### Browser

Install Google Chrome (or Chromium):

```bash
# Chrome
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" | sudo tee /etc/apt/sources.list.d/google-chrome.list
sudo apt update
sudo apt install google-chrome-stable

# Or Chromium (open source alternative)
sudo apt install chromium-browser
```

### API Keys

You'll need at least one API key for testing:

| Provider | Get Key From | Environment Variable |
|----------|--------------|---------------------|
| Anthropic | https://console.anthropic.com/settings/keys | `ANTHROPIC_API_KEY` |
| OpenAI | https://platform.openai.com/api-keys | `OPENAI_API_KEY` |
| Google | https://aistudio.google.com/apikey | `GOOGLE_GENERATIVE_AI_API_KEY` |

**Note:** For the experiment, keys are entered in the UI (not environment variables), but having them ready speeds up testing.

### Development Dependencies

```bash
# Create experiment directory
mkdir -p ~/experiments/ai-sdk-validation
cd ~/experiments/ai-sdk-validation

# Initialize project
npm init -y

# Install dependencies
npm install ai @ai-sdk/anthropic @ai-sdk/openai @ai-sdk/google
npm install react react-dom
npm install -D typescript vite @vitejs/plugin-react @types/react @types/react-dom
```

## Background

The browser extension plan assumes AI SDK works directly in extensions. This experiment validates that assumption based on the [Delight extension](https://medium.com/@andrewskwesiankomahene/building-delight-a-multi-provider-ai-chrome-extension-with-vercel-ai-sdk-c5c9f700bd55) architecture pattern.

### Why This Works (Theory)

1. **Chrome extensions bypass CORS** - Extensions with proper `host_permissions` can make direct API calls to LLM providers
2. **User-provided API keys** - No server-side key management needed
3. **AI SDK is pure JS** - Core functions (`generateText`, `streamText`) have no Node.js dependencies

### Reference Implementation

The Delight extension demonstrates:
- Direct `streamText()` calls from extension sidepanel
- 6 providers (OpenAI, Anthropic, Google, Grok, Groq, SambaNova)
- User-managed API keys stored in extension storage
- Real-time streaming UI updates

## Experiment Goals

1. **Confirm AI SDK imports** work in extension bundle (webpack/vite)
2. **Validate `streamText()`** works with Anthropic provider from extension context
3. **Test CORS behavior** with `host_permissions`
4. **Measure bundle size** impact of AI SDK + providers

## Experiment Setup

### Minimal Extension Structure

```
ai-sdk-validation/
├── manifest.json
├── src/
│   ├── background.ts      # Service worker
│   ├── sidepanel.html
│   ├── sidepanel.tsx      # React UI
│   └── ai-service.ts      # AI SDK wrapper
├── vite.config.ts
└── package.json
```

### manifest.json

```json
{
  "manifest_version": 3,
  "name": "AI SDK Validation",
  "version": "0.1.0",
  "permissions": [
    "storage",
    "sidePanel"
  ],
  "host_permissions": [
    "https://api.anthropic.com/*",
    "https://api.openai.com/*",
    "https://generativelanguage.googleapis.com/*"
  ],
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "action": {
    "default_title": "Open AI SDK Test"
  }
}
```

### Core Test: ai-service.ts

```typescript
import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';

export type Provider = 'anthropic' | 'openai';

export interface StreamOptions {
  provider: Provider;
  apiKey: string;
  prompt: string;
  onChunk: (text: string) => void;
  onComplete: () => void;
  onError: (error: Error) => void;
}

export async function testStream(options: StreamOptions): Promise<void> {
  const { provider, apiKey, prompt, onChunk, onComplete, onError } = options;

  const model = provider === 'anthropic'
    ? anthropic('claude-haiku-4-5', { apiKey })
    : openai('gpt-4o-mini', { apiKey });

  try {
    const result = await streamText({
      model,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 256,
    });

    for await (const chunk of result.textStream) {
      onChunk(chunk);
    }
    onComplete();
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));
  }
}
```

### UI Test: sidepanel.tsx

```tsx
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { testStream, Provider } from './ai-service';

function App() {
  const [apiKey, setApiKey] = useState('');
  const [provider, setProvider] = useState<Provider>('anthropic');
  const [prompt, setPrompt] = useState('Say hello in 10 words or less.');
  const [response, setResponse] = useState('');
  const [status, setStatus] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleTest = async () => {
    setResponse('');
    setError(null);
    setStatus('streaming');

    await testStream({
      provider,
      apiKey,
      prompt,
      onChunk: (text) => setResponse((prev) => prev + text),
      onComplete: () => setStatus('done'),
      onError: (err) => {
        setError(err.message);
        setStatus('error');
      },
    });
  };

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui' }}>
      <h2>AI SDK Browser Validation</h2>

      <div style={{ marginBottom: 12 }}>
        <label>Provider: </label>
        <select value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai">OpenAI (GPT)</option>
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>API Key: </label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          style={{ width: 300 }}
        />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>Prompt: </label>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          style={{ width: 300 }}
        />
      </div>

      <button onClick={handleTest} disabled={!apiKey || status === 'streaming'}>
        {status === 'streaming' ? 'Streaming...' : 'Test Stream'}
      </button>

      <div style={{ marginTop: 16 }}>
        <strong>Status:</strong> {status}
      </div>

      {error && (
        <div style={{ marginTop: 8, color: 'red' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {response && (
        <div style={{ marginTop: 8, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
          <strong>Response:</strong>
          <p>{response}</p>
        </div>
      )}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
```

### Configuration Files

#### vite.config.ts

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'src/sidepanel.html'),
        background: resolve(__dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]',
      },
    },
  },
});
```

#### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

#### src/sidepanel.html

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AI SDK Validation</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./sidepanel.tsx"></script>
  </body>
</html>
```

#### src/background.ts

```typescript
// Service worker - opens sidepanel on extension icon click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
```

#### package.json scripts

Add to your `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

## Build and Run

### 1. Build the Extension

```bash
cd ~/experiments/ai-sdk-validation
npm run build
```

This creates a `dist/` folder with the bundled extension.

### 2. Copy Manifest to dist

```bash
cp manifest.json dist/
```

### 3. Load in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `dist/` folder
5. The extension icon should appear in the toolbar

### 4. Test the Extension

1. Click the extension icon to open the sidepanel
2. Select a provider (Anthropic or OpenAI)
3. Paste your API key
4. Click **Test Stream**
5. Observe:
   - Does text stream incrementally? (tokens appear one by one)
   - Any CORS errors in the console? (`chrome://extensions/` → extension → "Inspect views: service worker")
   - Final status should be "done"

### 5. Check Bundle Size

```bash
# Total bundle size
du -sh dist/

# Individual files
ls -lh dist/*.js

# Gzipped size (what matters for distribution)
gzip -c dist/sidepanel.js | wc -c | numfmt --to=iec
```

## Success Criteria

| Criterion | Pass | Fail |
|-----------|------|------|
| Extension builds without Node.js polyfills | Bundle loads in Chrome | Requires `node:` polyfills |
| `streamText()` returns chunks | Tokens stream incrementally | Hangs or returns all at once |
| Anthropic API responds | 200 OK with content | CORS error or 4xx |
| OpenAI API responds | 200 OK with content | CORS error or 4xx |
| Bundle size reasonable | < 500KB gzipped | > 1MB |

## Expected Findings

Based on Delight's success, we expect:

1. **PASS**: AI SDK core functions work in extension context
2. **PASS**: `host_permissions` bypasses CORS for listed domains
3. **WATCH**: Bundle size may need tree-shaking if including all providers

## Potential Issues to Watch

### 1. Service Worker Restrictions

Chrome Manifest V3 service workers have limitations:
- No DOM access
- Short-lived (may terminate during long operations)

**Mitigation:** Run AI calls in sidepanel context, not background script.

### 2. Content Security Policy

Extensions have strict CSP by default.

**Mitigation:** May need to adjust CSP in manifest if AI SDK uses `eval()` or dynamic imports.

### 3. API Key Security

User keys stored in `chrome.storage.local` are accessible to extension code.

**Mitigation:**
- Document security model clearly
- Consider `chrome.storage.session` for ephemeral storage
- Future: investigate encryption at rest

## Next Steps After Validation

If experiment succeeds:
1. Document bundle configuration in implementation plan
2. Add streaming support to CLI `WorkerRuntime` (currently uses `generateText`)
3. Create shared `AIService` abstraction for both CLI and browser
4. Proceed with Phase 1.4 implementation

If experiment fails:
1. Document specific failure mode
2. Evaluate backend proxy architecture (like Vercel Labs example)
3. Update implementation plan with proxy requirements

## Related Documents

- [Browser Extension Implementation Plan](./browser-extension-implementation-plan.md)
- [Delight Extension Analysis](./delight.md) - Reference implementation
- [AI SDK Documentation](https://ai-sdk.dev/docs/introduction)
