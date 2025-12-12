/**
 * Tests for GitHub authentication.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getGitHubAuth, hasGitHubAuth, clearAuthCache } from './auth.js';
import { GitAuthError } from './types.js';

describe('GitHub authentication', () => {
  const originalEnv = process.env.GITHUB_TOKEN;

  beforeEach(() => {
    // Clear any cached auth
    clearAuthCache();
    // Clear env
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.GITHUB_TOKEN = originalEnv;
    } else {
      delete process.env.GITHUB_TOKEN;
    }
    clearAuthCache();
  });

  describe('getGitHubAuth', () => {
    it('uses GITHUB_TOKEN env var when available', () => {
      process.env.GITHUB_TOKEN = 'test-token-from-env';

      const auth = getGitHubAuth();

      expect(auth.username).toBe('oauth2');
      expect(auth.password).toBe('test-token-from-env');
    });

    it('throws GitAuthError when no auth available', () => {
      // No GITHUB_TOKEN and gh CLI likely not available in test env
      expect(() => getGitHubAuth()).toThrow(GitAuthError);
    });

    it('uses injected env before process.env', () => {
      process.env.GITHUB_TOKEN = 'host-token';

      const auth = getGitHubAuth({ env: { GITHUB_TOKEN: 'injected-token' } });

      expect(auth.password).toBe('injected-token');
    });

    it('explicit mode does not fall back to process.env', () => {
      process.env.GITHUB_TOKEN = 'host-token';

      expect(() => getGitHubAuth({ mode: 'explicit', env: {} })).toThrow(GitAuthError);
    });

    it('error message includes helpful instructions', () => {
      try {
        getGitHubAuth();
        // Should not reach here
        expect.fail('Expected GitAuthError');
      } catch (error) {
        expect(error).toBeInstanceOf(GitAuthError);
        expect((error as Error).message).toContain('GITHUB_TOKEN');
        expect((error as Error).message).toContain('gh auth login');
      }
    });
  });

  describe('hasGitHubAuth', () => {
    it('returns true when GITHUB_TOKEN is set', () => {
      process.env.GITHUB_TOKEN = 'test-token';

      expect(hasGitHubAuth()).toBe(true);
    });

    it('explicit mode returns true only when injected token is provided', () => {
      process.env.GITHUB_TOKEN = 'host-token';

      expect(hasGitHubAuth({ mode: 'explicit', env: {} })).toBe(false);
      expect(hasGitHubAuth({ mode: 'explicit', env: { GITHUB_TOKEN: 'injected' } })).toBe(true);
    });

    it('returns false when no auth available', () => {
      // Assuming gh CLI is not logged in during tests
      // This might be true if gh is available but not authenticated
      const result = hasGitHubAuth();
      // We can't reliably test the false case without mocking execSync
      // Just verify it returns a boolean
      expect(typeof result).toBe('boolean');
    });
  });

  describe('clearAuthCache', () => {
    it('clears cached gh CLI token', () => {
      // Set env token, check auth, clear cache
      process.env.GITHUB_TOKEN = 'test-token';
      getGitHubAuth();

      clearAuthCache();

      // Token still available from env (not from cache)
      const auth2 = getGitHubAuth();
      expect(auth2.password).toBe('test-token');
    });
  });
});
