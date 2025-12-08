import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync } from 'fs';

/**
 * Plugin to copy static assets to dist folder.
 */
function copyManifest(): Plugin {
  return {
    name: 'copy-manifest',
    closeBundle() {
      // Copy manifest.json to dist
      copyFileSync(
        resolve(__dirname, 'src/manifest.json'),
        resolve(__dirname, 'dist/manifest.json')
      );

      // Copy icons directory
      try {
        mkdirSync(resolve(__dirname, 'dist/icons'), { recursive: true });
        copyFileSync(
          resolve(__dirname, 'src/icons/icon.svg'),
          resolve(__dirname, 'dist/icons/icon.svg')
        );
      } catch {
        // Icons might not exist yet
      }
    },
  };
}

/**
 * Vite configuration for Golem Forge browser extension.
 *
 * Uses flattened structure (root: 'src') to avoid manifest path issues.
 * See docs/notes/ai-sdk-browser-lessons.md for validation details.
 */
export default defineConfig({
  root: 'src',
  plugins: [react(), copyManifest()],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup.html'),
        sidepanel: resolve(__dirname, 'src/sidepanel.html'),
        background: resolve(__dirname, 'src/background.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  // Ensure we don't use Node.js built-ins
  resolve: {
    alias: {
      // Map any Node.js imports that might sneak in
    },
  },
  define: {
    // Ensure process.env is handled for libraries that check it
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
});
