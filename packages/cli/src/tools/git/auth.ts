/**
 * GitHub Authentication
 *
 * Provides authentication for GitHub operations.
 * Uses fallback chain (inherit mode): injected env → process.env → gh CLI → error.
 *
 * In explicit mode, only injected env is used (no host leakage).
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

export type GitHubAuthMode = 'inherit' | 'explicit';

export interface GitHubAuthOptions {
  /** Credential resolution mode (default: inherit) */
  mode?: GitHubAuthMode;
  /** Injected env vars to use as a credential source */
  env?: Record<string, string>;
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
 * - inherit mode (default):
 *   1) injected env (CI-friendly / sandbox-friendly)
 *   2) process.env (host inheritance)
 *   3) gh CLI token (developer-friendly)
 *   4) Error with helpful message
 * - explicit mode:
 *   1) injected env only
 *   2) Error (no process.env / gh CLI fallback)
 *
 * @returns GitHub auth credentials
 * @throws GitAuthError if no authentication available
 */
export function getGitHubAuth(options: GitHubAuthOptions = {}): GitHubAuth {
  const mode: GitHubAuthMode = options.mode ?? 'inherit';

  // 1. Injected token (CI / sandbox-friendly)
  const injectedToken = options.env?.GITHUB_TOKEN;
  if (injectedToken) {
    return { username: 'oauth2', password: injectedToken };
  }

  if (mode === 'explicit') {
    throw new GitAuthError(
      'GitHub authentication required (credentials.mode=explicit).\n' +
      'Provide a token via injected env:\n' +
      '  - credentials.env.GITHUB_TOKEN'
    );
  }

  // 2. Host env token (CI-friendly)
  const envToken = process.env.GITHUB_TOKEN;
  if (envToken) {
    return { username: 'oauth2', password: envToken };
  }

  // 3. gh CLI (developer-friendly)
  const ghToken = getGhCliToken();
  if (ghToken) {
    return { username: 'oauth2', password: ghToken };
  }

  // 4. Fail with helpful message
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
export function hasGitHubAuth(options: GitHubAuthOptions = {}): boolean {
  const mode: GitHubAuthMode = options.mode ?? 'inherit';

  if (options.env?.GITHUB_TOKEN) {
    return true;
  }
  if (mode === 'explicit') {
    return false;
  }

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
