/**
 * Tests for ToolsetRegistry.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ToolsetRegistry, type ToolsetContext } from './registry.js';
import type { NamedTool } from './filesystem.js';
import { ApprovalController } from '../approval/index.js';

describe('ToolsetRegistry', () => {
  beforeEach(() => {
    // Clear registry before each test
    ToolsetRegistry.clear();
  });

  describe('register', () => {
    it('registers a toolset factory', () => {
      const factory = () => [];
      ToolsetRegistry.register('test', factory);
      expect(ToolsetRegistry.has('test')).toBe(true);
    });

    it('throws on duplicate registration', () => {
      ToolsetRegistry.register('test', () => []);
      expect(() => {
        ToolsetRegistry.register('test', () => []);
      }).toThrow('Toolset "test" already registered');
    });
  });

  describe('get', () => {
    it('returns registered factory', () => {
      const factory = () => [];
      ToolsetRegistry.register('test', factory);
      expect(ToolsetRegistry.get('test')).toBe(factory);
    });

    it('returns undefined for unregistered toolset', () => {
      expect(ToolsetRegistry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('has', () => {
    it('returns true for registered toolset', () => {
      ToolsetRegistry.register('test', () => []);
      expect(ToolsetRegistry.has('test')).toBe(true);
    });

    it('returns false for unregistered toolset', () => {
      expect(ToolsetRegistry.has('nonexistent')).toBe(false);
    });
  });

  describe('list', () => {
    it('returns all registered toolset names', () => {
      ToolsetRegistry.register('foo', () => []);
      ToolsetRegistry.register('bar', () => []);
      const list = ToolsetRegistry.list();
      expect(list).toContain('foo');
      expect(list).toContain('bar');
      expect(list.length).toBe(2);
    });

    it('returns empty array when no toolsets registered', () => {
      expect(ToolsetRegistry.list()).toEqual([]);
    });
  });

  describe('clear', () => {
    it('removes all registrations', () => {
      ToolsetRegistry.register('test', () => []);
      ToolsetRegistry.clear();
      expect(ToolsetRegistry.has('test')).toBe(false);
    });
  });

  describe('factory invocation', () => {
    it('factory receives context and returns tools', async () => {
      const mockTool: NamedTool = {
        name: 'test_tool',
        description: 'Test tool',
        inputSchema: {} as any,
        execute: async () => ({ success: true }),
      };

      let receivedContext: ToolsetContext | null = null;
      const factory = (ctx: ToolsetContext) => {
        receivedContext = ctx;
        return [mockTool];
      };

      ToolsetRegistry.register('test', factory);

      const context: ToolsetContext = {
        sandbox: undefined,
        approvalController: new ApprovalController({ mode: 'approve_all' }),
        projectRoot: '/test',
        config: { key: 'value' },
      };

      const factory2 = ToolsetRegistry.get('test')!;
      const tools = await factory2(context);

      expect(receivedContext).toBe(context);
      expect(tools).toEqual([mockTool]);
    });

    it('supports async factory functions', async () => {
      const mockTool: NamedTool = {
        name: 'async_tool',
        description: 'Async tool',
        inputSchema: {} as any,
        execute: async () => ({ success: true }),
      };

      const asyncFactory = async (_ctx: ToolsetContext): Promise<NamedTool[]> => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return [mockTool];
      };

      ToolsetRegistry.register('async', asyncFactory);

      const context: ToolsetContext = {
        approvalController: new ApprovalController({ mode: 'approve_all' }),
        config: {},
      };

      const factory = ToolsetRegistry.get('async')!;
      const tools = await factory(context);

      expect(tools).toEqual([mockTool]);
    });
  });
});
