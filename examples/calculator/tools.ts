/**
 * Custom calculation tools for the calculator worker.
 *
 * Demonstrates both export formats:
 * - Function + Schema (calculateFibonacci, calculateFactorial)
 * - Full Tool Object (calculatePrimeFactors)
 *
 * Tools can optionally receive a ToolContext as second argument:
 * ```typescript
 * import type { ToolContext } from '../../src/tools/index.js';
 *
 * export function myTool({ path }: { path: string }, ctx: ToolContext) {
 *   if (!ctx.sandbox) throw new Error('Sandbox required');
 *   return ctx.sandbox.read(path);
 * }
 * ```
 */

import { z } from 'zod';
import type { NamedTool } from '../../src/tools/index.js';

// ============================================================================
// Format 1: Function + Schema
// ============================================================================

/**
 * Calculate the nth Fibonacci number.
 */
export function calculateFibonacci({ n }: { n: number }): number {
  if (n < 0) {
    throw new Error('n must be non-negative');
  }
  if (n <= 1) return n;

  let a = 0;
  let b = 1;
  for (let i = 2; i <= n; i++) {
    [a, b] = [b, a + b];
  }
  return b;
}

export const calculateFibonacciSchema = z.object({
  n: z.number().int().min(0).describe('Position in the Fibonacci sequence (0-indexed)'),
});

/**
 * Calculate the factorial of n (n!).
 */
export function calculateFactorial({ n }: { n: number }): number {
  if (n < 0) {
    throw new Error('n must be non-negative');
  }
  if (n <= 1) return 1;

  let result = 1;
  for (let i = 2; i <= n; i++) {
    result *= i;
  }
  return result;
}

export const calculateFactorialSchema = z.object({
  n: z.number().int().min(0).max(170).describe('Number to calculate factorial for (max 170 to avoid overflow)'),
});

// ============================================================================
// Format 2: Full Tool Object
// ============================================================================

/**
 * Find all prime factors of a number.
 * Exported as a full NamedTool object to demonstrate that format.
 */
export const calculatePrimeFactors: NamedTool = {
  name: 'calculatePrimeFactors',
  description: 'Find all prime factors of a number, returned in ascending order with repetition',
  inputSchema: z.object({
    n: z.number().int().min(2).describe('Number to factorize (must be >= 2)'),
  }),
  // This tool is safe and doesn't need approval
  needsApproval: false,
  execute: async ({ n }: { n: number }) => {
    const factors: number[] = [];
    let num = n;
    let d = 2;

    while (d * d <= num) {
      while (num % d === 0) {
        factors.push(d);
        num = Math.floor(num / d);
      }
      d++;
    }

    if (num > 1) {
      factors.push(num);
    }

    return {
      number: n,
      factors,
      isComposite: factors.length > 1 || factors[0] !== n,
    };
  },
};
