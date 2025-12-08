/**
 * Tests for CLI Approval Callbacks
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ApprovalRequest } from '../approval/index.js';

// Mock readline before importing approval.js
const mockQuestion = vi.fn();
const mockClose = vi.fn();
vi.mock('readline', () => ({
  createInterface: vi.fn(() => ({
    question: mockQuestion,
    close: mockClose,
  })),
}));

import {
  createAutoApproveCallback,
  createAutoDenyCallback,
  createCLIApprovalCallback,
} from './approval.js';

describe('createAutoApproveCallback', () => {
  it('should auto-approve all requests', async () => {
    const callback = createAutoApproveCallback();

    const request: ApprovalRequest = {
      toolName: 'write_file',
      toolArgs: { path: '/test/file.txt', content: 'hello' },
      description: 'Write to file',
    };

    const decision = await callback(request);

    expect(decision.approved).toBe(true);
    expect(decision.remember).toBe('none');
  });

  it('should work for any tool', async () => {
    const callback = createAutoApproveCallback();

    const tools = ['read_file', 'delete_file', 'custom_tool'];

    for (const toolName of tools) {
      const request: ApprovalRequest = {
        toolName,
        toolArgs: {},
        description: `Execute ${toolName}`,
      };

      const decision = await callback(request);
      expect(decision.approved).toBe(true);
    }
  });
});

describe('createAutoDenyCallback', () => {
  it('should auto-deny all requests', async () => {
    const callback = createAutoDenyCallback();

    const request: ApprovalRequest = {
      toolName: 'write_file',
      toolArgs: { path: '/test/file.txt', content: 'hello' },
      description: 'Write to file',
    };

    const decision = await callback(request);

    expect(decision.approved).toBe(false);
    expect(decision.remember).toBe('none');
    expect(decision.note).toBe('Auto-denied in auto_deny mode');
  });

  it('should use custom reason when provided', async () => {
    const callback = createAutoDenyCallback('Custom deny reason');

    const request: ApprovalRequest = {
      toolName: 'write_file',
      toolArgs: {},
      description: 'Write to file',
    };

    const decision = await callback(request);

    expect(decision.approved).toBe(false);
    expect(decision.note).toBe('Custom deny reason');
  });

  it('should deny all tools', async () => {
    const callback = createAutoDenyCallback();

    const tools = ['read_file', 'delete_file', 'custom_tool'];

    for (const toolName of tools) {
      const request: ApprovalRequest = {
        toolName,
        toolArgs: {},
        description: `Execute ${toolName}`,
      };

      const decision = await callback(request);
      expect(decision.approved).toBe(false);
    }
  });
});

describe('createCLIApprovalCallback', () => {
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  const sampleRequest: ApprovalRequest = {
    toolName: 'write_file',
    toolArgs: { path: '/test/file.txt', content: 'hello world' },
    description: 'Write content to file',
  };

  /**
   * Helper to simulate readline response
   */
  function simulateUserInput(response: string) {
    mockQuestion.mockImplementation((_prompt: string, callback: (answer: string) => void) => {
      callback(response);
    });
  }

  it('should approve when user enters "y"', async () => {
    simulateUserInput('y');
    const callback = createCLIApprovalCallback();

    const decision = await callback(sampleRequest);

    expect(decision.approved).toBe(true);
    expect(decision.remember).toBe('none');
    expect(mockClose).toHaveBeenCalled();
  });

  it('should approve when user enters "yes"', async () => {
    simulateUserInput('yes');
    const callback = createCLIApprovalCallback();

    const decision = await callback(sampleRequest);

    expect(decision.approved).toBe(true);
    expect(decision.remember).toBe('none');
  });

  it('should approve with session remember when user enters "r"', async () => {
    simulateUserInput('r');
    const callback = createCLIApprovalCallback();

    const decision = await callback(sampleRequest);

    expect(decision.approved).toBe(true);
    expect(decision.remember).toBe('session');
  });

  it('should approve with session remember when user enters "remember"', async () => {
    simulateUserInput('remember');
    const callback = createCLIApprovalCallback();

    const decision = await callback(sampleRequest);

    expect(decision.approved).toBe(true);
    expect(decision.remember).toBe('session');
  });

  it('should deny when user enters "n"', async () => {
    simulateUserInput('n');
    const callback = createCLIApprovalCallback();

    const decision = await callback(sampleRequest);

    expect(decision.approved).toBe(false);
    expect(decision.remember).toBe('none');
  });

  it('should deny when user enters "no"', async () => {
    simulateUserInput('no');
    const callback = createCLIApprovalCallback();

    const decision = await callback(sampleRequest);

    expect(decision.approved).toBe(false);
    expect(decision.remember).toBe('none');
  });

  it('should deny when user presses enter (empty input)', async () => {
    simulateUserInput('');
    const callback = createCLIApprovalCallback();

    const decision = await callback(sampleRequest);

    expect(decision.approved).toBe(false);
    expect(decision.remember).toBe('none');
  });

  it('should deny on unknown input', async () => {
    simulateUserInput('maybe');
    const callback = createCLIApprovalCallback();

    const decision = await callback(sampleRequest);

    expect(decision.approved).toBe(false);
    expect(consoleLogSpy).toHaveBeenCalledWith("Unknown response, treating as 'no'");
  });

  it('should be case insensitive', async () => {
    simulateUserInput('YES');
    const callback = createCLIApprovalCallback();

    const decision = await callback(sampleRequest);

    expect(decision.approved).toBe(true);
  });

  it('should display tool information', async () => {
    simulateUserInput('y');
    const callback = createCLIApprovalCallback();

    await callback(sampleRequest);

    expect(consoleLogSpy).toHaveBeenCalledWith('Tool: write_file');
    expect(consoleLogSpy).toHaveBeenCalledWith('Description: Write content to file');
  });

  it('should display arguments', async () => {
    simulateUserInput('y');
    const callback = createCLIApprovalCallback();

    await callback(sampleRequest);

    expect(consoleLogSpy).toHaveBeenCalledWith('Arguments:');
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('path: /test/file.txt'));
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('content: hello world'));
  });

  it('should truncate long argument values', async () => {
    simulateUserInput('y');
    const callback = createCLIApprovalCallback();

    const longContentRequest: ApprovalRequest = {
      toolName: 'write_file',
      toolArgs: {
        content: 'a'.repeat(100), // Very long content
      },
      description: 'Write long content',
    };

    await callback(longContentRequest);

    // Should truncate to 57 chars + "..."
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringMatching(/content: a{57}\.\.\./)
    );
  });

  it('should not display arguments section when empty', async () => {
    simulateUserInput('y');
    const callback = createCLIApprovalCallback();

    const noArgsRequest: ApprovalRequest = {
      toolName: 'list_files',
      toolArgs: {},
      description: 'List files',
    };

    await callback(noArgsRequest);

    // "Arguments:" should not be printed
    const argsCalls = consoleLogSpy.mock.calls.filter(
      (call) => call[0] === 'Arguments:'
    );
    expect(argsCalls).toHaveLength(0);
  });

  it('should close readline interface even on error', async () => {
    mockQuestion.mockImplementation(() => {
      throw new Error('readline error');
    });

    const callback = createCLIApprovalCallback();

    await expect(callback(sampleRequest)).rejects.toThrow('readline error');
    expect(mockClose).toHaveBeenCalled();
  });

  it('should hide trust level when showTrustLevel is false', async () => {
    simulateUserInput('y');
    const callback = createCLIApprovalCallback({ showTrustLevel: false });

    await callback(sampleRequest);

    // Trust: should not be printed
    const trustCalls = consoleLogSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && call[0].startsWith('Trust:')
    );
    expect(trustCalls).toHaveLength(0);
  });

  describe('git tool formatting', () => {
    it('should format git_stage with files and message', async () => {
      simulateUserInput('y');
      const callback = createCLIApprovalCallback();

      const gitStageRequest: ApprovalRequest = {
        toolName: 'git_stage',
        toolArgs: {
          files: ['src/index.ts', 'src/utils.ts'],
          message: 'Add new feature',
        },
        description: 'Stage files for commit',
      };

      await callback(gitStageRequest);

      // Should show file list
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Files to stage:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('src/index.ts'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('src/utils.ts'));
      // Should show commit message
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Commit message:'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Add new feature'));
    });

    it('should format git_push with local target', async () => {
      simulateUserInput('y');
      const callback = createCLIApprovalCallback();

      const gitPushRequest: ApprovalRequest = {
        toolName: 'git_push',
        toolArgs: {
          commitId: 'abc123',
          target: {
            type: 'local',
            path: '/home/user/repo',
            branch: 'main',
          },
        },
        description: 'Push staged commit',
      };

      await callback(gitPushRequest);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Staged commit: abc123'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('local repository'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('/home/user/repo'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Branch: main'));
    });

    it('should format git_push with github target', async () => {
      simulateUserInput('y');
      const callback = createCLIApprovalCallback();

      const gitPushRequest: ApprovalRequest = {
        toolName: 'git_push',
        toolArgs: {
          commitId: 'xyz789',
          target: {
            type: 'github',
            repo: 'owner/repo',
            branch: 'feature',
          },
        },
        description: 'Push to GitHub',
      };

      await callback(gitPushRequest);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Staged commit: xyz789'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('GitHub owner/repo'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Branch: feature'));
    });

    it('should handle unknown target types with fallback', async () => {
      simulateUserInput('y');
      const callback = createCLIApprovalCallback();

      const gitPushRequest: ApprovalRequest = {
        toolName: 'git_push',
        toolArgs: {
          commitId: 'def456',
          target: {
            type: 'future-target',
            branch: 'dev',
          },
        },
        description: 'Push to future target',
      };

      await callback(gitPushRequest);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Target: future-target'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Branch: dev'));
    });

    it('should not show Arguments: prefix for git tools', async () => {
      simulateUserInput('y');
      const callback = createCLIApprovalCallback();

      const gitStageRequest: ApprovalRequest = {
        toolName: 'git_stage',
        toolArgs: {
          files: ['test.txt'],
          message: 'Test',
        },
        description: 'Stage files',
      };

      await callback(gitStageRequest);

      // "Arguments:" should not be printed for git tools
      const argsCalls = consoleLogSpy.mock.calls.filter(
        (call) => call[0] === 'Arguments:'
      );
      expect(argsCalls).toHaveLength(0);
    });
  });
});
