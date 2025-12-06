import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { z } from 'zod';
import {
  loadCustomTools,
  isNamedTool,
  isZodSchema,
  wrapWithDefaultApproval,
  createToolFromFunction,
  CustomToolsetConfigSchema,
} from './custom.js';
import type { NamedTool } from './filesystem.js';

describe('Custom Tools', () => {
  // Temporary directory for test fixtures
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'custom-tools-test-'));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('isNamedTool', () => {
    it('returns true for valid NamedTool objects', () => {
      const tool: NamedTool = {
        name: 'test',
        description: 'A test tool',
        inputSchema: z.object({ x: z.number() }),
        execute: async () => 'result',
      };
      expect(isNamedTool(tool)).toBe(true);
    });

    it('returns false for plain functions', () => {
      expect(isNamedTool(() => {})).toBe(false);
    });

    it('returns false for objects missing required properties', () => {
      expect(isNamedTool({ name: 'test' })).toBe(false);
      expect(isNamedTool({ name: 'test', inputSchema: z.object({}) })).toBe(false);
      expect(isNamedTool({ inputSchema: z.object({}), execute: async () => {} })).toBe(false);
    });

    it('returns false for null and undefined', () => {
      expect(isNamedTool(null)).toBe(false);
      expect(isNamedTool(undefined)).toBe(false);
    });
  });

  describe('isZodSchema', () => {
    it('returns true for Zod schemas', () => {
      expect(isZodSchema(z.object({ x: z.number() }))).toBe(true);
      expect(isZodSchema(z.string())).toBe(true);
      expect(isZodSchema(z.array(z.number()))).toBe(true);
    });

    it('returns false for plain objects', () => {
      expect(isZodSchema({ type: 'object' })).toBe(false);
      expect(isZodSchema({})).toBe(false);
    });

    it('returns false for null and undefined', () => {
      expect(isZodSchema(null)).toBe(false);
      expect(isZodSchema(undefined)).toBe(false);
    });
  });

  describe('wrapWithDefaultApproval', () => {
    const baseTool: NamedTool = {
      name: 'testTool',
      description: 'Test',
      inputSchema: z.object({}),
      execute: async () => 'ok',
    };

    it('respects existing needsApproval on tool', () => {
      const toolWithApproval = { ...baseTool, needsApproval: false };
      const wrapped = wrapWithDefaultApproval(toolWithApproval, { default: 'ask' });
      expect(wrapped.needsApproval).toBe(false);
    });

    it('applies config default when tool has no needsApproval', () => {
      const wrapped = wrapWithDefaultApproval(baseTool, { default: 'preApproved' });
      expect(wrapped.needsApproval).toBe(false);
    });

    it('applies per-tool config override', () => {
      const wrapped = wrapWithDefaultApproval(baseTool, {
        default: 'ask',
        tools: { testTool: 'preApproved' },
      });
      expect(wrapped.needsApproval).toBe(false);
    });

    it('defaults to ask (needsApproval: true) when no config', () => {
      const wrapped = wrapWithDefaultApproval(baseTool);
      expect(wrapped.needsApproval).toBe(true);
    });

    it('sets needsApproval true for ask', () => {
      const wrapped = wrapWithDefaultApproval(baseTool, { default: 'ask' });
      expect(wrapped.needsApproval).toBe(true);
    });

    it('sets needsApproval true for blocked', () => {
      const wrapped = wrapWithDefaultApproval(baseTool, { default: 'blocked' });
      expect(wrapped.needsApproval).toBe(true);
    });
  });

  describe('createToolFromFunction', () => {
    it('creates a NamedTool from a function and schema', async () => {
      const fn = ({ x, y }: { x: number; y: number }) => x + y;
      const schema = z.object({
        x: z.number(),
        y: z.number(),
      });

      const tool = createToolFromFunction('add', fn, schema, 'Add two numbers');

      expect(tool.name).toBe('add');
      expect(tool.description).toBe('Add two numbers');
      expect(tool.inputSchema).toBe(schema);

      const result = await tool.execute({ x: 2, y: 3 }, {});
      expect(result).toBe(5);
    });

    it('supports async functions', async () => {
      const fn = async ({ delay }: { delay: number }) => {
        await new Promise(resolve => setTimeout(resolve, delay));
        return 'done';
      };
      const schema = z.object({ delay: z.number() });

      const tool = createToolFromFunction('asyncTool', fn, schema);
      const result = await tool.execute({ delay: 10 }, {});
      expect(result).toBe('done');
    });

    it('uses default description when none provided', () => {
      const fn = () => 'result';
      const schema = z.object({});

      const tool = createToolFromFunction('myTool', fn, schema);
      expect(tool.description).toBe('Custom tool: myTool');
    });
  });

  describe('CustomToolsetConfigSchema', () => {
    it('validates correct config', () => {
      const config = {
        module: './tools.ts',
        tools: ['foo', 'bar'],
        approval: {
          default: 'ask',
          tools: { foo: 'preApproved' },
        },
      };
      const result = CustomToolsetConfigSchema.safeParse(config);
      expect(result.success).toBe(true);
    });

    it('requires module and tools', () => {
      expect(CustomToolsetConfigSchema.safeParse({}).success).toBe(false);
      expect(CustomToolsetConfigSchema.safeParse({ module: './tools.ts' }).success).toBe(false);
      expect(CustomToolsetConfigSchema.safeParse({ tools: ['foo'] }).success).toBe(false);
    });

    it('requires at least one tool', () => {
      const result = CustomToolsetConfigSchema.safeParse({
        module: './tools.ts',
        tools: [],
      });
      expect(result.success).toBe(false);
    });

    it('validates approval decision types', () => {
      const result = CustomToolsetConfigSchema.safeParse({
        module: './tools.ts',
        tools: ['foo'],
        approval: { default: 'invalid' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('loadCustomTools', () => {
    it('loads function + schema exports', async () => {
      // Create a test tools module
      const toolsPath = path.join(tempDir, 'tools-func.mjs');
      await fs.writeFile(toolsPath, `
import { z } from 'zod';

export function greet({ name }) {
  return \`Hello, \${name}!\`;
}

export const greetSchema = z.object({
  name: z.string(),
});
      `);

      const tools = await loadCustomTools(toolsPath, {
        module: toolsPath,
        tools: ['greet'],
      });

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('greet');

      const result = await tools[0].execute({ name: 'World' }, {});
      expect(result).toBe('Hello, World!');
    });

    it('loads NamedTool object exports', async () => {
      const toolsPath = path.join(tempDir, 'tools-obj.mjs');
      await fs.writeFile(toolsPath, `
import { z } from 'zod';

export const multiply = {
  name: 'multiply',
  description: 'Multiply two numbers',
  inputSchema: z.object({
    a: z.number(),
    b: z.number(),
  }),
  execute: async ({ a, b }) => a * b,
};
      `);

      const tools = await loadCustomTools(toolsPath, {
        module: toolsPath,
        tools: ['multiply'],
      });

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('multiply');
      expect(tools[0].description).toBe('Multiply two numbers');

      const result = await tools[0].execute({ a: 3, b: 4 }, {});
      expect(result).toBe(12);
    });

    it('applies approval config to tools', async () => {
      const toolsPath = path.join(tempDir, 'tools-approval.mjs');
      await fs.writeFile(toolsPath, `
import { z } from 'zod';

export function safeOp({ x }) { return x; }
export const safeOpSchema = z.object({ x: z.number() });

export function riskyOp({ x }) { return x; }
export const riskyOpSchema = z.object({ x: z.number() });
      `);

      const tools = await loadCustomTools(toolsPath, {
        module: toolsPath,
        tools: ['safeOp', 'riskyOp'],
        approval: {
          default: 'ask',
          tools: { safeOp: 'preApproved' },
        },
      });

      const safeTool = tools.find(t => t.name === 'safeOp')!;
      const riskyTool = tools.find(t => t.name === 'riskyOp')!;

      expect(safeTool.needsApproval).toBe(false);
      expect(riskyTool.needsApproval).toBe(true);
    });

    it('respects tool-defined needsApproval', async () => {
      const toolsPath = path.join(tempDir, 'tools-self-approval.mjs');
      await fs.writeFile(toolsPath, `
import { z } from 'zod';

export const selfApproved = {
  name: 'selfApproved',
  inputSchema: z.object({}),
  needsApproval: false,
  execute: async () => 'ok',
};
      `);

      const tools = await loadCustomTools(toolsPath, {
        module: toolsPath,
        tools: ['selfApproved'],
        approval: { default: 'ask' }, // Would normally require approval
      });

      expect(tools[0].needsApproval).toBe(false); // Tool's own setting wins
    });

    it('throws for missing tool export', async () => {
      const toolsPath = path.join(tempDir, 'tools-missing.mjs');
      await fs.writeFile(toolsPath, `
export const exists = { name: 'exists', inputSchema: {}, execute: async () => {} };
      `);

      await expect(
        loadCustomTools(toolsPath, {
          module: toolsPath,
          tools: ['nonexistent'],
        })
      ).rejects.toThrow(/not found/);
    });

    it('throws for function without schema', async () => {
      const toolsPath = path.join(tempDir, 'tools-no-schema.mjs');
      await fs.writeFile(toolsPath, `
export function noSchema() { return 'ok'; }
      `);

      await expect(
        loadCustomTools(toolsPath, {
          module: toolsPath,
          tools: ['noSchema'],
        })
      ).rejects.toThrow(/Schema.*not found/);
    });

    it('throws for invalid schema export', async () => {
      const toolsPath = path.join(tempDir, 'tools-bad-schema.mjs');
      await fs.writeFile(toolsPath, `
export function badSchema() { return 'ok'; }
export const badSchemaSchema = { type: 'object' }; // Not a Zod schema
      `);

      await expect(
        loadCustomTools(toolsPath, {
          module: toolsPath,
          tools: ['badSchema'],
        })
      ).rejects.toThrow(/not a valid Zod schema/);
    });

    it('throws for invalid export type', async () => {
      const toolsPath = path.join(tempDir, 'tools-invalid.mjs');
      await fs.writeFile(toolsPath, `
export const invalidTool = 'not a function or tool';
      `);

      await expect(
        loadCustomTools(toolsPath, {
          module: toolsPath,
          tools: ['invalidTool'],
        })
      ).rejects.toThrow(/must be either/);
    });
  });
});
