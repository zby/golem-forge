/**
 * Session memory for approval caching.
 *
 * This module provides ApprovalMemory, which caches approval decisions
 * within a session to avoid repeatedly prompting for identical operations.
 */

import type { ApprovalDecision } from "./types.js";

/**
 * Session cache to avoid re-prompting for identical calls.
 *
 * When a user approves an operation with remember="session", subsequent
 * identical requests (same toolName + toolArgs) will be auto-approved
 * without prompting.
 *
 * The cache key is (toolName, JSON-serialized toolArgs).
 *
 * @example
 * ```typescript
 * const memory = new ApprovalMemory();
 *
 * // Store an approval
 * const decision: ApprovalDecision = { approved: true, remember: "session" };
 * memory.store("write_file", { path: "/tmp/test.txt" }, decision);
 *
 * // Later lookup
 * const cached = memory.lookup("write_file", { path: "/tmp/test.txt" });
 * if (cached?.approved) {
 *   // Skip prompting, use cached approval
 * }
 * ```
 */
export class ApprovalMemory {
  private cache = new Map<string, ApprovalDecision>();

  /**
   * Look up a previous approval decision.
   *
   * @param toolName - Name of the tool
   * @param args - Tool arguments (will be JSON-serialized for matching)
   * @returns Cached ApprovalDecision if found, undefined otherwise
   */
  lookup(
    toolName: string,
    args: Record<string, unknown>
  ): ApprovalDecision | undefined {
    const key = this.makeKey(toolName, args);
    return this.cache.get(key);
  }

  /**
   * Store an approval decision for session reuse.
   *
   * Only stores if decision.remember === "session". Decisions with
   * remember="none" are not cached.
   *
   * @param toolName - Name of the tool
   * @param args - Tool arguments (will be JSON-serialized for matching)
   * @param decision - The approval decision to cache
   */
  store(
    toolName: string,
    args: Record<string, unknown>,
    decision: ApprovalDecision
  ): void {
    if (decision.remember === "none") {
      return;
    }
    const key = this.makeKey(toolName, args);
    this.cache.set(key, decision);
  }

  /**
   * Clear all session approvals.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * List all cached session approvals.
   *
   * @returns Array of [toolName, toolArgs, decision] tuples for all cached approvals.
   */
  listApprovals(): Array<{
    toolName: string;
    toolArgs: Record<string, unknown>;
    decision: ApprovalDecision;
  }> {
    const result: Array<{
      toolName: string;
      toolArgs: Record<string, unknown>;
      decision: ApprovalDecision;
    }> = [];

    for (const [key, decision] of this.cache.entries()) {
      const { toolName, toolArgs } = this.parseKey(key);
      result.push({ toolName, toolArgs, decision });
    }

    return result;
  }

  /**
   * Return the number of cached approvals.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Create hashable key for session matching.
   * Uses deterministic JSON serialization with sorted keys at all levels.
   */
  private makeKey(toolName: string, args: Record<string, unknown>): string {
    const sortedArgs = this.stableStringify(args);
    return `${toolName}:${sortedArgs}`;
  }

  /**
   * Stable JSON stringify that sorts keys at all levels of nesting.
   */
  private stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return "[" + value.map((v) => this.stableStringify(v)).join(",") + "]";
    }

    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const pairs = keys.map((k) => `${JSON.stringify(k)}:${this.stableStringify(obj[k])}`);
    return "{" + pairs.join(",") + "}";
  }

  /**
   * Parse a cache key back into toolName and toolArgs.
   */
  private parseKey(key: string): {
    toolName: string;
    toolArgs: Record<string, unknown>;
  } {
    const colonIndex = key.indexOf(":");
    const toolName = key.slice(0, colonIndex);
    const toolArgs = JSON.parse(key.slice(colonIndex + 1));
    return { toolName, toolArgs };
  }
}
