/**
 * Diff Renderer
 *
 * Renders file diffs with colored output for CLI display.
 * Uses the diff package for generating line-by-line differences.
 */

import { diffLines } from "diff";
import pc from "picocolors";

// ============================================================================
// Constants
// ============================================================================

/** Default number of context lines around changes */
const DEFAULT_CONTEXT_LINES = 3;

/** Default maximum lines to show before truncating */
const DEFAULT_MAX_LINES = 100;

/**
 * Options for diff rendering.
 */
export interface DiffRenderOptions {
  /** Show line numbers (default: true) */
  lineNumbers?: boolean;
  /** Number of context lines around changes (default: 3) */
  contextLines?: number;
  /** Maximum lines to show before truncating (default: 100) */
  maxLines?: number;
  /** Override new file detection (uses original === undefined/empty if not provided) */
  isNew?: boolean;
}

/**
 * Render a diff between original and modified content.
 *
 * @param original - Original content (undefined for new files)
 * @param modified - Modified content
 * @param options - Rendering options
 * @returns Colored diff string for terminal display
 */
export function renderDiff(
  original: string | undefined,
  modified: string,
  options: DiffRenderOptions = {}
): string {
  const {
    lineNumbers = true,
    contextLines = DEFAULT_CONTEXT_LINES,
    maxLines = DEFAULT_MAX_LINES,
    isNew,
  } = options;

  // Handle new file case - use explicit isNew if provided, otherwise infer from original
  const treatAsNew = isNew ?? (original === undefined || original === "");
  if (treatAsNew) {
    return renderNewFile(modified, lineNumbers, maxLines);
  }

  // Generate diff - original is guaranteed to be a string here when not treating as new
  // Use empty string fallback for TypeScript (but this path only runs when !treatAsNew)
  const originalContent = original ?? "";
  const changes = diffLines(originalContent, modified);

  // Build output with context handling
  const lines: string[] = [];
  const lineNum = { old: 1, new: 1 };
  let truncated = false;

  for (const change of changes) {
    if (lines.length >= maxLines) {
      truncated = true;
      break;
    }

    const changeLines = change.value.split("\n");
    // Remove trailing empty string from split if content ends with newline
    if (changeLines[changeLines.length - 1] === "") {
      changeLines.pop();
    }

    if (change.added) {
      // Added lines (green)
      for (const line of changeLines) {
        if (lines.length >= maxLines) {
          truncated = true;
          break;
        }
        const prefix = lineNumbers ? formatLineNum(undefined, lineNum.new) : "";
        lines.push(pc.green(`${prefix}+ ${line}`));
        lineNum.new++;
      }
    } else if (change.removed) {
      // Removed lines (red)
      for (const line of changeLines) {
        if (lines.length >= maxLines) {
          truncated = true;
          break;
        }
        const prefix = lineNumbers ? formatLineNum(lineNum.old, undefined) : "";
        lines.push(pc.red(`${prefix}- ${line}`));
        lineNum.old++;
      }
    } else {
      // Context lines (unchanged)
      const contextResult = getContextLines(changeLines, contextLines, change === changes[0], change === changes[changes.length - 1]);

      for (const item of contextResult.items) {
        if (lines.length >= maxLines) {
          truncated = true;
          break;
        }

        if (item.type === "ellipsis") {
          lines.push(pc.dim("  ..."));
          // Jump line numbers past the skipped lines
          lineNum.old += item.skippedCount;
          lineNum.new += item.skippedCount;
        } else {
          const prefix = lineNumbers ? formatLineNum(lineNum.old, lineNum.new) : "";
          lines.push(pc.dim(`${prefix}  ${item.line}`));
          lineNum.old++;
          lineNum.new++;
        }
      }
    }
  }

  if (truncated) {
    lines.push(pc.yellow(`\n... (truncated, showing first ${maxLines} lines)`));
  }

  return lines.join("\n");
}

/**
 * Render a new file (all lines as additions).
 */
function renderNewFile(content: string, lineNumbers: boolean, maxLines: number): string {
  const lines = content.split("\n");
  const output: string[] = [];
  let truncated = false;

  for (let i = 0; i < lines.length; i++) {
    if (output.length >= maxLines) {
      truncated = true;
      break;
    }
    const prefix = lineNumbers ? formatLineNum(undefined, i + 1) : "";
    output.push(pc.green(`${prefix}+ ${lines[i]}`));
  }

  if (truncated) {
    output.push(pc.yellow(`\n... (truncated, showing first ${maxLines} lines)`));
  }

  return output.join("\n");
}

/**
 * Format line numbers for display.
 */
function formatLineNum(oldNum: number | undefined, newNum: number | undefined): string {
  const oldStr = oldNum !== undefined ? String(oldNum).padStart(4) : "    ";
  const newStr = newNum !== undefined ? String(newNum).padStart(4) : "    ";
  return `${pc.dim(oldStr)} ${pc.dim(newStr)} `;
}

/**
 * Item in context result - either a line or an ellipsis with skip count.
 */
type ContextItem =
  | { type: "line"; line: string }
  | { type: "ellipsis"; skippedCount: number };

/**
 * Result of getContextLines with items and metadata.
 */
interface ContextResult {
  items: ContextItem[];
}

/**
 * Get context lines to show, with ellipsis for large unchanged sections.
 * Returns items with proper skip counts for accurate line number tracking.
 */
function getContextLines(
  lines: string[],
  contextCount: number,
  isFirst: boolean,
  isLast: boolean
): ContextResult {
  if (lines.length <= contextCount * 2) {
    // Show all lines if section is small enough
    return {
      items: lines.map(line => ({ type: "line" as const, line })),
    };
  }

  const items: ContextItem[] = [];

  // Show first N context lines (unless this is the first change)
  const startContext = isFirst ? 0 : contextCount;
  for (let i = 0; i < startContext && i < lines.length; i++) {
    items.push({ type: "line", line: lines[i] });
  }

  // Show last N context lines (unless this is the last change)
  const endContext = isLast ? 0 : contextCount;
  const endStartIdx = Math.max(lines.length - endContext, startContext);

  // Add ellipsis if there's a gap, with the count of skipped lines
  const skippedCount = endStartIdx - startContext;
  if (skippedCount > 0) {
    items.push({ type: "ellipsis", skippedCount });
  }

  for (let i = endStartIdx; i < lines.length; i++) {
    items.push({ type: "line", line: lines[i] });
  }

  return { items };
}

/**
 * Count the number of lines in content.
 * Empty string returns 0, not 1.
 */
function countLines(content: string): number {
  if (content === "") return 0;
  // Count newlines, but content without trailing newline still counts as 1 line
  const newlineCount = (content.match(/\n/g) || []).length;
  // If content ends with newline, that's the line count; otherwise add 1
  return content.endsWith("\n") ? newlineCount : newlineCount + 1;
}

/**
 * Get a summary of changes (for display header).
 *
 * @param original - Original content (undefined for new files)
 * @param modified - Modified content
 * @param isNew - Override new file detection
 */
export function getDiffSummary(
  original: string | undefined,
  modified: string,
  isNew?: boolean
): string {
  // Use explicit isNew if provided, otherwise infer from original
  const treatAsNew = isNew ?? (original === undefined || original === "");
  if (treatAsNew) {
    const lines = countLines(modified);
    return `+${lines} lines (new file)`;
  }

  const changes = diffLines(original ?? "", modified);
  let added = 0;
  let removed = 0;

  for (const change of changes) {
    const lineCount = change.value.split("\n").filter(l => l !== "").length;
    if (change.added) {
      added += lineCount;
    } else if (change.removed) {
      removed += lineCount;
    }
  }

  const parts: string[] = [];
  if (added > 0) parts.push(pc.green(`+${added}`));
  if (removed > 0) parts.push(pc.red(`-${removed}`));

  return parts.length > 0 ? parts.join(", ") : "no changes";
}
