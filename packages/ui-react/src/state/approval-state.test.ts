/**
 * Tests for Approval State Management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createApprovalState,
  compareRisk,
  isRiskAtOrBelow,
  matchesApprovalPattern,
  findMatchingPattern,
  isAutoApproved,
  createPatternFromRequest,
  addApproval,
  addSessionApproval,
  addAlwaysApproval,
  clearSessionApprovals,
  clearApprovalHistory,
  removeAlwaysApproval,
  getApprovalStats,
} from './approval-state.js';
import type { ApprovalState, ApprovalPattern, ApprovalRequestData } from './approval-state.js';

describe('Approval State', () => {
  let state: ApprovalState;

  beforeEach(() => {
    state = createApprovalState();
  });

  describe('createApprovalState', () => {
    it('should create empty state', () => {
      expect(state.sessionApprovals).toEqual([]);
      expect(state.alwaysApprovals).toEqual([]);
      expect(state.history).toEqual([]);
    });

    it('should accept initial always approvals', () => {
      const initialPatterns: ApprovalPattern[] = [
        { type: 'tool_call', maxRisk: 'low' },
      ];
      const stateWithInitial = createApprovalState(initialPatterns);

      expect(stateWithInitial.alwaysApprovals).toHaveLength(1);
      expect(stateWithInitial.alwaysApprovals[0]).toEqual(initialPatterns[0]);
    });
  });

  describe('risk comparison', () => {
    it('should compare risk levels correctly', () => {
      expect(compareRisk('low', 'low')).toBe(0);
      expect(compareRisk('low', 'medium')).toBeLessThan(0);
      expect(compareRisk('low', 'high')).toBeLessThan(0);
      expect(compareRisk('medium', 'low')).toBeGreaterThan(0);
      expect(compareRisk('medium', 'medium')).toBe(0);
      expect(compareRisk('medium', 'high')).toBeLessThan(0);
      expect(compareRisk('high', 'low')).toBeGreaterThan(0);
      expect(compareRisk('high', 'medium')).toBeGreaterThan(0);
      expect(compareRisk('high', 'high')).toBe(0);
    });

    it('should check isRiskAtOrBelow correctly', () => {
      expect(isRiskAtOrBelow('low', 'low')).toBe(true);
      expect(isRiskAtOrBelow('low', 'medium')).toBe(true);
      expect(isRiskAtOrBelow('low', 'high')).toBe(true);
      expect(isRiskAtOrBelow('medium', 'low')).toBe(false);
      expect(isRiskAtOrBelow('medium', 'medium')).toBe(true);
      expect(isRiskAtOrBelow('medium', 'high')).toBe(true);
      expect(isRiskAtOrBelow('high', 'low')).toBe(false);
      expect(isRiskAtOrBelow('high', 'medium')).toBe(false);
      expect(isRiskAtOrBelow('high', 'high')).toBe(true);
    });
  });

  describe('matchesApprovalPattern', () => {
    it('should match by type only', () => {
      const pattern: ApprovalPattern = { type: 'tool_call' };
      const request: ApprovalRequestData = {
        type: 'tool_call',
        description: 'Any description',
        risk: 'high',
      };

      expect(matchesApprovalPattern(request, pattern)).toBe(true);
    });

    it('should not match different types', () => {
      const pattern: ApprovalPattern = { type: 'tool_call' };
      const request: ApprovalRequestData = {
        type: 'file_write',
        description: 'Test',
        risk: 'low',
      };

      expect(matchesApprovalPattern(request, pattern)).toBe(false);
    });

    it('should match by description pattern', () => {
      const pattern: ApprovalPattern = {
        type: 'command',
        descriptionPattern: 'npm install',
      };

      expect(
        matchesApprovalPattern(
          { type: 'command', description: 'Execute npm install package', risk: 'medium' },
          pattern
        )
      ).toBe(true);

      expect(
        matchesApprovalPattern(
          { type: 'command', description: 'Execute yarn add package', risk: 'medium' },
          pattern
        )
      ).toBe(false);
    });

    it('should match by max risk level', () => {
      const pattern: ApprovalPattern = { type: 'tool_call', maxRisk: 'medium' };

      expect(
        matchesApprovalPattern(
          { type: 'tool_call', description: 'Test', risk: 'low' },
          pattern
        )
      ).toBe(true);

      expect(
        matchesApprovalPattern(
          { type: 'tool_call', description: 'Test', risk: 'medium' },
          pattern
        )
      ).toBe(true);

      expect(
        matchesApprovalPattern(
          { type: 'tool_call', description: 'Test', risk: 'high' },
          pattern
        )
      ).toBe(false);
    });

    it('should combine all conditions', () => {
      const pattern: ApprovalPattern = {
        type: 'file_write',
        descriptionPattern: 'config',
        maxRisk: 'medium',
      };

      // All conditions met
      expect(
        matchesApprovalPattern(
          { type: 'file_write', description: 'Update config.json', risk: 'low' },
          pattern
        )
      ).toBe(true);

      // Wrong type
      expect(
        matchesApprovalPattern(
          { type: 'command', description: 'Update config.json', risk: 'low' },
          pattern
        )
      ).toBe(false);

      // Description doesn't match
      expect(
        matchesApprovalPattern(
          { type: 'file_write', description: 'Update settings.json', risk: 'low' },
          pattern
        )
      ).toBe(false);

      // Risk too high
      expect(
        matchesApprovalPattern(
          { type: 'file_write', description: 'Update config.json', risk: 'high' },
          pattern
        )
      ).toBe(false);
    });
  });

  describe('findMatchingPattern and isAutoApproved', () => {
    it('should find session approval first', () => {
      const sessionPattern: ApprovalPattern = { type: 'tool_call', maxRisk: 'low' };
      const alwaysPattern: ApprovalPattern = { type: 'tool_call', maxRisk: 'high' };

      state = addSessionApproval(state, sessionPattern);
      state = addAlwaysApproval(state, alwaysPattern);

      const request: ApprovalRequestData = {
        type: 'tool_call',
        description: 'Test',
        risk: 'low',
      };

      const result = findMatchingPattern(state, request);
      expect(result).not.toBeUndefined();
      expect(result?.scope).toBe('session');
    });

    it('should find always approval when no session match', () => {
      const alwaysPattern: ApprovalPattern = { type: 'tool_call', maxRisk: 'medium' };
      state = addAlwaysApproval(state, alwaysPattern);

      const request: ApprovalRequestData = {
        type: 'tool_call',
        description: 'Test',
        risk: 'medium',
      };

      const result = findMatchingPattern(state, request);
      expect(result).not.toBeUndefined();
      expect(result?.scope).toBe('always');
    });

    it('should return undefined when no match', () => {
      const pattern: ApprovalPattern = { type: 'tool_call', maxRisk: 'low' };
      state = addSessionApproval(state, pattern);

      const request: ApprovalRequestData = {
        type: 'file_write',
        description: 'Test',
        risk: 'high',
      };

      expect(findMatchingPattern(state, request)).toBeUndefined();
      expect(isAutoApproved(state, request)).toBe(false);
    });

    it('should check isAutoApproved correctly', () => {
      state = addAlwaysApproval(state, { type: 'tool_call', maxRisk: 'medium' });

      expect(
        isAutoApproved(state, { type: 'tool_call', description: 'Test', risk: 'low' })
      ).toBe(true);

      expect(
        isAutoApproved(state, { type: 'tool_call', description: 'Test', risk: 'high' })
      ).toBe(false);
    });
  });

  describe('createPatternFromRequest', () => {
    it('should create pattern without description', () => {
      const request: ApprovalRequestData = {
        type: 'command',
        description: 'Execute npm test',
        risk: 'medium',
      };

      const pattern = createPatternFromRequest(request, false);

      expect(pattern.type).toBe('command');
      expect(pattern.maxRisk).toBe('medium');
      expect(pattern.descriptionPattern).toBeUndefined();
    });

    it('should create pattern with description', () => {
      const request: ApprovalRequestData = {
        type: 'file_write',
        description: 'Write to package.json',
        risk: 'high',
      };

      const pattern = createPatternFromRequest(request, true);

      expect(pattern.type).toBe('file_write');
      expect(pattern.maxRisk).toBe('high');
      expect(pattern.descriptionPattern).toBe('Write to package.json');
    });
  });

  describe('addApproval', () => {
    const request: ApprovalRequestData = {
      type: 'tool_call',
      description: 'Run test tool',
      risk: 'low',
    };

    it('should record approval in history', () => {
      state = addApproval(state, request, { approved: true });

      expect(state.history).toHaveLength(1);
      expect(state.history[0].request).toEqual(request);
      expect(state.history[0].result).toEqual({ approved: true });
      expect(state.history[0].timestamp).toBeDefined();
    });

    it('should add session pattern on session approval', () => {
      state = addApproval(state, request, { approved: 'session' });

      expect(state.sessionApprovals).toHaveLength(1);
      expect(state.sessionApprovals[0].type).toBe('tool_call');
      expect(state.alwaysApprovals).toHaveLength(0);
    });

    it('should add always pattern on always approval', () => {
      state = addApproval(state, request, { approved: 'always' });

      expect(state.alwaysApprovals).toHaveLength(1);
      expect(state.alwaysApprovals[0].type).toBe('tool_call');
      expect(state.sessionApprovals).toHaveLength(0);
    });

    it('should not add pattern on simple true approval', () => {
      state = addApproval(state, request, { approved: true });

      expect(state.sessionApprovals).toHaveLength(0);
      expect(state.alwaysApprovals).toHaveLength(0);
    });

    it('should not add pattern on denial', () => {
      state = addApproval(state, request, { approved: false, reason: 'Test' });

      expect(state.sessionApprovals).toHaveLength(0);
      expect(state.alwaysApprovals).toHaveLength(0);
      expect(state.history).toHaveLength(1);
    });
  });

  describe('clearSessionApprovals', () => {
    it('should clear session approvals but keep always', () => {
      state = addSessionApproval(state, { type: 'tool_call' });
      state = addAlwaysApproval(state, { type: 'file_write' });

      state = clearSessionApprovals(state);

      expect(state.sessionApprovals).toHaveLength(0);
      expect(state.alwaysApprovals).toHaveLength(1);
    });
  });

  describe('clearApprovalHistory', () => {
    it('should clear history but keep patterns', () => {
      state = addApproval(
        state,
        { type: 'tool_call', description: 'Test', risk: 'low' },
        { approved: 'session' }
      );

      state = clearApprovalHistory(state);

      expect(state.history).toHaveLength(0);
      expect(state.sessionApprovals).toHaveLength(1);
    });
  });

  describe('removeAlwaysApproval', () => {
    it('should remove matching pattern', () => {
      const pattern: ApprovalPattern = { type: 'command', maxRisk: 'low' };
      state = addAlwaysApproval(state, pattern);
      state = addAlwaysApproval(state, { type: 'file_write' });

      state = removeAlwaysApproval(state, pattern);

      expect(state.alwaysApprovals).toHaveLength(1);
      expect(state.alwaysApprovals[0].type).toBe('file_write');
    });
  });

  describe('getApprovalStats', () => {
    it('should return correct statistics', () => {
      // Add various approvals
      state = addSessionApproval(state, { type: 'tool_call' });
      state = addSessionApproval(state, { type: 'command' });
      state = addAlwaysApproval(state, { type: 'file_write' });

      // Add history entries
      state = addApproval(
        state,
        { type: 'tool_call', description: 'Test 1', risk: 'low' },
        { approved: true }
      );
      state = addApproval(
        state,
        { type: 'tool_call', description: 'Test 2', risk: 'high' },
        { approved: false, reason: 'Too risky' }
      );
      state = addApproval(
        state,
        { type: 'command', description: 'Test 3', risk: 'medium' },
        { approved: 'session' }
      );

      const stats = getApprovalStats(state);

      // Note: addApproval with 'session' adds another session approval
      expect(stats.sessionCount).toBe(3);
      expect(stats.alwaysCount).toBe(1);
      expect(stats.historyCount).toBe(3);
      expect(stats.approvedCount).toBe(2);
      expect(stats.deniedCount).toBe(1);
    });
  });

  describe('immutability', () => {
    it('should not mutate original state', () => {
      const original = createApprovalState();

      addSessionApproval(original, { type: 'tool_call' });

      expect(original.sessionApprovals).toHaveLength(0);
    });
  });

  describe('approval result discriminators', () => {
    // These tests verify that the approval semantics preserve the
    // session/always discriminators correctly (fixes issue where
    // all approvals were converted to boolean true)

    const request: ApprovalRequestData = {
      type: 'tool_call',
      description: 'Test operation',
      risk: 'low',
    };

    it('should preserve approved: true as simple approval', () => {
      state = addApproval(state, request, { approved: true });

      const lastEntry = state.history[state.history.length - 1];
      expect(lastEntry.result.approved).toBe(true);
      // Should NOT add to session or always approvals
      expect(state.sessionApprovals).toHaveLength(0);
      expect(state.alwaysApprovals).toHaveLength(0);
    });

    it('should preserve approved: session discriminator', () => {
      state = addApproval(state, request, { approved: 'session' });

      const lastEntry = state.history[state.history.length - 1];
      expect(lastEntry.result.approved).toBe('session');
      // Should add to session approvals
      expect(state.sessionApprovals).toHaveLength(1);
    });

    it('should preserve approved: always discriminator', () => {
      state = addApproval(state, request, { approved: 'always' });

      const lastEntry = state.history[state.history.length - 1];
      expect(lastEntry.result.approved).toBe('always');
      // Should add to always approvals
      expect(state.alwaysApprovals).toHaveLength(1);
    });

    it('should preserve approved: false with reason', () => {
      state = addApproval(state, request, { approved: false, reason: 'Too risky' });

      const lastEntry = state.history[state.history.length - 1];
      expect(lastEntry.result.approved).toBe(false);
      if (lastEntry.result.approved === false) {
        expect(lastEntry.result.reason).toBe('Too risky');
      }
    });

    it('should count session and always as approved in stats', () => {
      state = addApproval(state, request, { approved: true });
      state = addApproval(state, request, { approved: 'session' });
      state = addApproval(state, request, { approved: 'always' });
      state = addApproval(state, request, { approved: false });

      const stats = getApprovalStats(state);
      expect(stats.approvedCount).toBe(3); // true, session, always
      expect(stats.deniedCount).toBe(1); // false
    });
  });
});
