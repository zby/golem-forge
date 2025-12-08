# AI SDK Browser Experiment: Lessons Learned

**Date:** 2025-12-08
**Experiment:** `experiments/ai-sdk-validation`
**Status:** Success (with modifications)

## Executive Summary
The Vercel AI SDK is compatible with Chrome Extensions (Manifest V3) for client-side streaming, but requires specific configuration hacks to bypass browser security restrictions and ensure proper bundle structure.

## Key Findings

### 1. Browser Security & CORS
Standard usage of the AI SDK in a browser environment triggers CORS or security errors because the SDK defaults to server-side behavior.

*   **Anthropic**: Validated. Requires a special header to acknowledge client-side risk.
    ```typescript
    createAnthropic({ 
      apiKey, 
      headers: { 'anthropic-dangerous-direct-browser-access': 'true' } 
    })
    ```
*   **OpenAI**: Validated. Requires a specific flag.
    ```typescript
    createOpenAI({ 
      apiKey, 
      dangerouslyAllowBrowser: true 
    })
    ```

### 2. Vite Build Configuration for Extensions
The standard Vite build structure produces nested `dist/src` folders when the entry point is outside the root or structured uniquely. This breaks `manifest.json` path resolution.

*   **Fix**: Set `root: 'src'` in `vite.config.ts` and adjust `outDir` to `../dist`.
    ```typescript
    export default defineConfig({
      root: 'src',
      build: {
        outDir: '../dist',
        emptyOutDir: true,
        // ...
      }
    });
    ```
*   **Result**: Produces a flat structure where `manifest.json` (at root) can correctly find `sidepanel.html` and bundled JS.

### 3. TypeScript & Types
*   **Parameter naming**: The `streamText` function uses `maxOutputTokens`, not `maxTokens` (which is deprecated or invalid in some contexts of the Core API).
*   **Explicit Types**: `@types/chrome` is essential for development but not for the runtime build.

### 4. Bundle Size & Polyfills
*   **Size**: The bundle is lightweight (~140KB gzipped including React).
*   **Polyfills**: No Node.js polyfills (like `buffer` or `stream`) were required for the core `streamText` functionality, confirming the AI SDK's edge/browser compatibility.

## Recommendations for Phase 1.4
1.  **Architecture**: Use the `createanthropic` / `createOpenAI` factory pattern with the headers/flags shown above.
2.  **Security**: Since API keys are handled client-side, we must continue to ensure they are stored in `chrome.storage.local` (or session) and not hardcoded.
3.  **Build System**: Adopt the flattened Vite config pattern to avoid manifest path issues.
