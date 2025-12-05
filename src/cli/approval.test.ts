/**
 * Tests for CLI Approval Callbacks
 */

import { describe, it, expect } from 'vitest';
import {
  createAutoApproveCallback,
  createAutoDenyCallback,
} from './approval.js';
import type { ApprovalRequest } from '../approval/index.js';

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

    const tools = ['read_file', 'delete_file', 'stage_for_commit', 'custom_tool'];

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
    expect(decision.note).toBe('Auto-denied in strict mode');
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

    const tools = ['read_file', 'delete_file', 'stage_for_commit', 'custom_tool'];

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
