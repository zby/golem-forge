/**
 * Tests for Worker Schema
 */

import { describe, it, expect } from 'vitest';
import {
  WorkerDefinitionSchema,
  WorkerFrontmatterSchema,
  WorkerSandboxConfigSchema,
  ApprovalDecisionTypeSchema,
  formatParseError,
  type ParseWorkerResult,
} from './worker-schema.js';

describe('ApprovalDecisionTypeSchema', () => {
  it('accepts valid values', () => {
    expect(ApprovalDecisionTypeSchema.parse('preApproved')).toBe('preApproved');
    expect(ApprovalDecisionTypeSchema.parse('ask')).toBe('ask');
    expect(ApprovalDecisionTypeSchema.parse('blocked')).toBe('blocked');
  });

  it('rejects invalid values', () => {
    expect(() => ApprovalDecisionTypeSchema.parse('invalid')).toThrow();
  });
});

describe('WorkerSandboxConfigSchema', () => {
  it('accepts valid sandbox config', () => {
    const config = {
      restrict: '/src',
      readonly: true,
      approval: {
        write: 'preApproved' as const,
        delete: 'ask' as const,
      },
    };
    const result = WorkerSandboxConfigSchema.parse(config);
    expect(result.restrict).toBe('/src');
    expect(result.readonly).toBe(true);
    expect(result.approval?.write).toBe('preApproved');
  });

  it('requires restrict to start with /', () => {
    expect(() =>
      WorkerSandboxConfigSchema.parse({ restrict: 'src' })
    ).toThrow();
  });

  it('rejects unknown fields (strict)', () => {
    expect(() =>
      WorkerSandboxConfigSchema.parse({ unknownField: true })
    ).toThrow();
  });
});

describe('WorkerFrontmatterSchema', () => {
  it('parses minimal frontmatter', () => {
    const result = WorkerFrontmatterSchema.parse({ name: 'test' });
    expect(result.name).toBe('test');
    expect(result.locked).toBe(false); // default
    expect(result.server_side_tools).toEqual([]); // default
  });

  it('parses frontmatter with all fields', () => {
    const frontmatter = {
      name: 'test-worker',
      description: 'A test worker',
      compatible_models: ['anthropic:*', 'openai:gpt-4o'],
      sandbox: {
        restrict: '/workspace',
        readonly: false,
      },
      toolsets: {
        filesystem: {},
        shell: { allowed_commands: ['ls', 'cat'] },
      },
      attachment_policy: {
        max_attachments: 2,
        max_total_bytes: 5_000_000,
      },
      server_side_tools: [
        { name: 'web_search' },
      ],
      locked: true,
    };
    const result = WorkerFrontmatterSchema.parse(frontmatter);
    expect(result.name).toBe('test-worker');
    expect(result.description).toBe('A test worker');
    expect(result.compatible_models).toEqual(['anthropic:*', 'openai:gpt-4o']);
    expect(result.locked).toBe(true);
  });

  it('rejects unknown fields (strict)', () => {
    expect(() =>
      WorkerFrontmatterSchema.parse({ name: 'test', unknownField: true })
    ).toThrow();
  });
});

describe('WorkerDefinitionSchema', () => {
  it('parses complete worker definition', () => {
    const definition = {
      name: 'greeter',
      description: 'A friendly greeter',
      instructions: 'You are a friendly assistant.',
    };
    const result = WorkerDefinitionSchema.parse(definition);
    expect(result.name).toBe('greeter');
    expect(result.instructions).toBe('You are a friendly assistant.');
  });

  it('requires instructions', () => {
    expect(() =>
      WorkerDefinitionSchema.parse({ name: 'test' })
    ).toThrow();
  });

  it('requires name', () => {
    expect(() =>
      WorkerDefinitionSchema.parse({ instructions: 'test' })
    ).toThrow();
  });
});

describe('formatParseError', () => {
  it('returns "No error" for success', () => {
    const result: ParseWorkerResult = {
      success: true,
      worker: {
        name: 'test',
        instructions: 'test',
        server_side_tools: [],
        locked: false,
      },
    };
    expect(formatParseError(result)).toBe('No error');
  });

  it('formats error with details', () => {
    const parseResult = WorkerDefinitionSchema.safeParse({ name: 123 });
    const result: ParseWorkerResult = {
      success: false,
      error: 'Invalid worker',
      details: parseResult.success ? undefined : parseResult.error,
    };
    const formatted = formatParseError(result);
    expect(formatted).toContain('Invalid worker');
    expect(formatted).toContain('name');
  });

  it('formats error without details', () => {
    const result: ParseWorkerResult = {
      success: false,
      error: 'Something went wrong',
    };
    expect(formatParseError(result)).toBe('Something went wrong');
  });
});
