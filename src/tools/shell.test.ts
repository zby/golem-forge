/**
 * Shell Tool Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkMetacharacters,
  parseCommand,
  matchShellRules,
  executeShell,
  createShellTool,
  ShellToolset,
  ShellBlockedError,
  BLOCKED_METACHARACTERS,
  type ShellRule,
  type ShellDefault,
  type ShellConfig,
} from './shell.js';
import { BlockedError } from '../approval/index.js';

describe('checkMetacharacters', () => {
  it('should pass for safe commands', () => {
    expect(() => checkMetacharacters('ls -la')).not.toThrow();
    expect(() => checkMetacharacters('git status')).not.toThrow();
    expect(() => checkMetacharacters('echo hello')).not.toThrow();
  });

  it('should block pipe', () => {
    expect(() => checkMetacharacters('cat file | grep foo')).toThrow(ShellBlockedError);
    expect(() => checkMetacharacters('cat file | grep foo')).toThrow(/blocked metacharacter '\|'/);
  });

  it('should block redirect', () => {
    expect(() => checkMetacharacters('echo foo > file')).toThrow(ShellBlockedError);
    expect(() => checkMetacharacters('cat < file')).toThrow(ShellBlockedError);
  });

  it('should block semicolon', () => {
    expect(() => checkMetacharacters('ls; rm -rf /')).toThrow(ShellBlockedError);
  });

  it('should block ampersand', () => {
    expect(() => checkMetacharacters('sleep 100 &')).toThrow(ShellBlockedError);
    expect(() => checkMetacharacters('cmd1 && cmd2')).toThrow(ShellBlockedError);
  });

  it('should block backtick', () => {
    expect(() => checkMetacharacters('echo `whoami`')).toThrow(ShellBlockedError);
  });

  it('should block command substitution', () => {
    expect(() => checkMetacharacters('echo $(whoami)')).toThrow(ShellBlockedError);
    expect(() => checkMetacharacters('echo ${HOME}')).toThrow(ShellBlockedError);
  });

  it('should block all metacharacters', () => {
    for (const char of BLOCKED_METACHARACTERS) {
      expect(() => checkMetacharacters(`cmd ${char} arg`)).toThrow(ShellBlockedError);
    }
  });
});

describe('parseCommand', () => {
  it('should parse simple commands', () => {
    expect(parseCommand('ls')).toEqual(['ls']);
    expect(parseCommand('ls -la')).toEqual(['ls', '-la']);
    expect(parseCommand('git status')).toEqual(['git', 'status']);
  });

  it('should handle quoted strings', () => {
    expect(parseCommand('echo "hello world"')).toEqual(['echo', 'hello world']);
    expect(parseCommand("echo 'hello world'")).toEqual(['echo', 'hello world']);
    expect(parseCommand('git commit -m "my message"')).toEqual([
      'git',
      'commit',
      '-m',
      'my message',
    ]);
  });

  it('should handle escaped characters', () => {
    expect(parseCommand('echo hello\\ world')).toEqual(['echo', 'hello world']);
  });

  it('should throw on invalid syntax', () => {
    expect(() => parseCommand('echo "unterminated')).toThrow(ShellBlockedError);
    expect(() => parseCommand("echo 'unterminated")).toThrow(ShellBlockedError);
  });
});

describe('matchShellRules', () => {
  it('should match exact command', () => {
    const rules: ShellRule[] = [{ pattern: 'git status', approvalRequired: false }];

    const result = matchShellRules('git status', rules);
    expect(result.allowed).toBe(true);
    expect(result.approvalRequired).toBe(false);
  });

  it('should match command prefix', () => {
    const rules: ShellRule[] = [{ pattern: 'git ', approvalRequired: false }];

    expect(matchShellRules('git status', rules).allowed).toBe(true);
    expect(matchShellRules('git commit -m "msg"', rules).allowed).toBe(true);
    expect(matchShellRules('gitx status', rules).allowed).toBe(false);
  });

  it('should use first matching rule', () => {
    const rules: ShellRule[] = [
      { pattern: 'git status', approvalRequired: false },
      { pattern: 'git ', approvalRequired: true },
    ];

    const result = matchShellRules('git status', rules);
    expect(result.approvalRequired).toBe(false);
  });

  it('should use default when no rule matches', () => {
    const rules: ShellRule[] = [{ pattern: 'git ', approvalRequired: false }];
    const defaultConfig: ShellDefault = { approvalRequired: true };

    const result = matchShellRules('ls -la', rules, defaultConfig);
    expect(result.allowed).toBe(true);
    expect(result.approvalRequired).toBe(true);
  });

  it('should block when no rule matches and no default', () => {
    const rules: ShellRule[] = [{ pattern: 'git ', approvalRequired: false }];

    const result = matchShellRules('ls -la', rules);
    expect(result.allowed).toBe(false);
  });

  it('should handle empty rules with default', () => {
    const defaultConfig: ShellDefault = { approvalRequired: false };

    const result = matchShellRules('any command', [], defaultConfig);
    expect(result.allowed).toBe(true);
    expect(result.approvalRequired).toBe(false);
  });
});

describe('executeShell', () => {
  it('should execute simple commands', async () => {
    const result = await executeShell('echo hello');
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello');
    expect(result.stderr).toBe('');
    expect(result.truncated).toBe(false);
  });

  it('should capture stderr', async () => {
    const result = await executeShell('ls /nonexistent-dir-12345');
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('No such file or directory');
  });

  it('should handle command not found', async () => {
    const result = await executeShell('nonexistent-command-xyz');
    expect(result.exitCode).toBe(127);
    expect(result.stderr).toContain('Command not found');
  });

  it('should respect timeout', async () => {
    const result = await executeShell('sleep 10', { timeout: 1 });
    expect(result.exitCode).toBe(-1);
    expect(result.stderr).toContain('timed out');
  }, 5000);

  it('should block metacharacters', async () => {
    await expect(executeShell('echo foo | cat')).rejects.toThrow(ShellBlockedError);
  });

  it('should work with working directory', async () => {
    const result = await executeShell('pwd', { workingDir: '/tmp' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('/tmp');
  });

  it('should work with environment variables', async () => {
    const result = await executeShell('printenv TEST_VAR', {
      env: { TEST_VAR: 'test_value' },
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('test_value');
  });
});

describe('createShellTool', () => {
  it('should create a shell tool', () => {
    const tool = createShellTool();
    expect(tool.name).toBe('shell');
    expect(tool.description).toContain('Execute a shell command');
  });

  it('should execute commands through the tool', async () => {
    const tool = createShellTool({
      config: { rules: [], default: { approvalRequired: false } },
    });

    const result = await tool.execute(
      { command: 'echo hello', timeout: 30 },
      {} as any
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello');
  });

  it('should throw BlockedError for commands not in whitelist', async () => {
    const tool = createShellTool({
      config: { rules: [{ pattern: 'git ', approvalRequired: false }] },
    });

    await expect(
      tool.execute({ command: 'ls -la', timeout: 30 }, {} as any)
    ).rejects.toThrow(BlockedError);
  });

  it('should allow whitelisted commands', async () => {
    const tool = createShellTool({
      config: {
        rules: [{ pattern: 'echo ', approvalRequired: false }],
      },
    });

    const result = await tool.execute(
      { command: 'echo test', timeout: 30 },
      {} as any
    );
    expect(result.exitCode).toBe(0);
  });

  describe('needsApproval', () => {
    it('should return false for pre-approved commands', () => {
      const tool = createShellTool({
        config: {
          rules: [{ pattern: 'git status', approvalRequired: false }],
        },
      });

      const needsApproval = tool.needsApproval as (input: any) => boolean;
      expect(needsApproval({ command: 'git status', timeout: 30 })).toBe(false);
    });

    it('should return true for commands requiring approval', () => {
      const tool = createShellTool({
        config: {
          rules: [{ pattern: 'git ', approvalRequired: true }],
        },
      });

      const needsApproval = tool.needsApproval as (input: any) => boolean;
      expect(needsApproval({ command: 'git commit -m "test"', timeout: 30 })).toBe(true);
    });

    it('should return true for unknown commands (will be blocked)', () => {
      const tool = createShellTool({
        config: {
          rules: [{ pattern: 'git ', approvalRequired: false }],
        },
      });

      const needsApproval = tool.needsApproval as (input: any) => boolean;
      // Unknown commands need approval so we can show the BlockedError
      expect(needsApproval({ command: 'rm -rf /', timeout: 30 })).toBe(true);
    });

    it('should use default when no rule matches', () => {
      const tool = createShellTool({
        config: {
          rules: [],
          default: { approvalRequired: false },
        },
      });

      const needsApproval = tool.needsApproval as (input: any) => boolean;
      expect(needsApproval({ command: 'any-command', timeout: 30 })).toBe(false);
    });
  });
});

describe('ShellToolset', () => {
  it('should create a toolset with shell tool', () => {
    const toolset = new ShellToolset();
    const tools = toolset.getTools();

    expect(tools).toHaveLength(1);
    expect(tools[0].name).toBe('shell');
  });

  it('should pass options to the tool', () => {
    const config: ShellConfig = {
      rules: [{ pattern: 'echo ', approvalRequired: false }],
    };

    const toolset = new ShellToolset({ config });
    const tools = toolset.getTools();
    const tool = tools[0];

    const needsApproval = tool.needsApproval as (input: any) => boolean;
    expect(needsApproval({ command: 'echo test', timeout: 30 })).toBe(false);
  });
});
