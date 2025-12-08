/**
 * Tests for git credential configuration.
 */

import { describe, it, expect } from 'vitest';
import { GitCredentialsConfigSchema, GitToolsetConfigSchema } from './types.js';
import { GitToolset } from './index.js';

describe('GitCredentialsConfigSchema', () => {
  it('defaults to inherit mode', () => {
    const result = GitCredentialsConfigSchema.parse({});
    expect(result.mode).toBe('inherit');
  });

  it('accepts inherit mode explicitly', () => {
    const result = GitCredentialsConfigSchema.parse({ mode: 'inherit' });
    expect(result.mode).toBe('inherit');
  });

  it('accepts explicit mode', () => {
    const result = GitCredentialsConfigSchema.parse({ mode: 'explicit' });
    expect(result.mode).toBe('explicit');
  });

  it('accepts env variables', () => {
    const result = GitCredentialsConfigSchema.parse({
      env: {
        GIT_AUTHOR_NAME: 'Test Author',
        GIT_AUTHOR_EMAIL: 'test@example.com',
      },
    });
    expect(result.env).toEqual({
      GIT_AUTHOR_NAME: 'Test Author',
      GIT_AUTHOR_EMAIL: 'test@example.com',
    });
  });

  it('rejects invalid mode', () => {
    expect(() => GitCredentialsConfigSchema.parse({ mode: 'invalid' })).toThrow();
  });
});

describe('GitToolsetConfigSchema', () => {
  it('accepts credentials configuration', () => {
    const result = GitToolsetConfigSchema.parse({
      credentials: {
        mode: 'inherit',
        env: {
          GIT_SSH_COMMAND: 'ssh -i ~/.ssh/custom_key',
        },
      },
    });
    expect(result.credentials?.mode).toBe('inherit');
    expect(result.credentials?.env?.GIT_SSH_COMMAND).toBe('ssh -i ~/.ssh/custom_key');
  });

  it('accepts config without credentials', () => {
    const result = GitToolsetConfigSchema.parse({
      default_target: {
        type: 'local',
        path: '.',
      },
    });
    expect(result.credentials).toBeUndefined();
  });
});

describe('GitToolset', () => {
  it('creates toolset with default credentials (inherit mode)', () => {
    const toolset = new GitToolset({});
    const tools = toolset.getTools();
    expect(tools.length).toBeGreaterThan(0);
  });

  it('creates toolset with explicit credentials config', () => {
    const toolset = new GitToolset({
      config: {
        credentials: {
          mode: 'inherit',
          env: {
            GIT_AUTHOR_NAME: 'Worker Bot',
          },
        },
      },
    });
    const tools = toolset.getTools();
    expect(tools.length).toBeGreaterThan(0);
  });

  it('creates toolset with explicit mode (no host credentials)', () => {
    const toolset = new GitToolset({
      config: {
        credentials: {
          mode: 'explicit',
          env: {
            GITHUB_TOKEN: 'test-token',
          },
        },
      },
    });
    const tools = toolset.getTools();
    expect(tools.length).toBeGreaterThan(0);
  });
});
