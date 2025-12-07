/**
 * GitHub Authentication
 *
 * Provides authentication for GitHub operations.
 * Uses fallback chain: GITHUB_TOKEN env var → gh CLI → error.
 */

import { execSync } from 'child_process';
import { GitAuthError } from './types.js';

/**
 * GitHub authentication credentials.
 */
export interface GitHubAuth {
  /** Username (usually 'oauth2' for token auth) */
  username: string;
  /** OAuth token or personal access token */
  password: string;
}

/**
 * Cache for gh CLI token lookup.
 * Avoids repeated subprocess spawns.
 */
let cachedGhToken: string | null = null;
let ghTokenChecked = false;

/**
 * Try to get token from gh CLI.
 * Caches result to avoid repeated subprocess calls.
 */
function getGhCliToken(): string | null {
  if (ghTokenChecked) {
    return cachedGhToken;
  }

  ghTokenChecked = true;

  try {
    // gh auth token returns the current token
    const token = execSync('gh auth token', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'], // Capture stderr too
      timeout: 5000, // 5 second timeout
    }).trim();

    if (token) {
      cachedGhToken = token;
      return token;
    }
  } catch {
    // gh CLI not installed, not logged in, or timed out
  }

  return null;
}

/**
 * Get GitHub authentication credentials.
 *
 * Fallback chain:
 * 1. GITHUB_TOKEN environment variable (CI-friendly)
 * 2. gh CLI token (developer-friendly)
 * 3. Error with helpful message
 *
 * @returns GitHub auth credentials
 * @throws GitAuthError if no authentication available
 */
export function getGitHubAuth(): GitHubAuth {
  // 1. Explicit token (CI-friendly)
  const envToken = process.env.GITHUB_TOKEN;
  if (envToken) {
    return { username: 'oauth2', password: envToken };
  }

  // 2. gh CLI (developer-friendly)
  const ghToken = getGhCliToken();
  if (ghToken) {
    return { username: 'oauth2', password: ghToken };
  }

  // 3. Fail with helpful message
  throw new GitAuthError(
    'GitHub authentication required.\n' +
    'Either:\n' +
    '  - Set GITHUB_TOKEN environment variable, or\n' +
    '  - Run `gh auth login` to authenticate with GitHub CLI'
  );
}

/**
 * Check if GitHub authentication is available without throwing.
 *
 * @returns true if auth is available
 */
export function hasGitHubAuth(): boolean {
  if (process.env.GITHUB_TOKEN) {
    return true;
  }
  return getGhCliToken() !== null;
}

/**
 * Clear cached authentication (for testing).
 */
export function clearAuthCache(): void {
  cachedGhToken = null;
  ghTokenChecked = false;
}
