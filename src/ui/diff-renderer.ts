/**
 * Diff Renderer
 *
 * Renders file diffs with colored output for CLI display.
 * Uses the diff package for generating line-by-line differences.
 */

import { diffLines } from "diff";
import pc from "picocolors";

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
    contextLines = 3,
    maxLines = 100,
  } = options;

  // Handle new file case
  if (original === undefined || original === "") {
    return renderNewFile(modified, lineNumbers, maxLines);
  }

  // Generate diff
  const changes = diffLines(original, modified);

  // Build output with context handling
  const lines: string[] = [];
  let lineNum = { old: 1, new: 1 };
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
      const contextToShow = getContextLines(changeLines, contextLines, change === changes[0], change === changes[changes.length - 1]);

      for (const { line, showEllipsis } of contextToShow) {
        if (lines.length >= maxLines) {
          truncated = true;
          break;
        }

        if (showEllipsis) {
          lines.push(pc.dim("  ..."));
        } else {
          const prefix = lineNumbers ? formatLineNum(lineNum.old, lineNum.new) : "";
          lines.push(pc.dim(`${prefix}  ${line}`));
        }
        lineNum.old++;
        lineNum.new++;
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
 * Get context lines to show, with ellipsis for large unchanged sections.
 */
function getContextLines(
  lines: string[],
  contextCount: number,
  isFirst: boolean,
  isLast: boolean
): Array<{ line: string; showEllipsis: boolean }> {
  if (lines.length <= contextCount * 2) {
    // Show all lines if section is small enough
    return lines.map(line => ({ line, showEllipsis: false }));
  }

  const result: Array<{ line: string; showEllipsis: boolean }> = [];

  // Show first N context lines (unless this is the first change)
  const startContext = isFirst ? 0 : contextCount;
  for (let i = 0; i < startContext && i < lines.length; i++) {
    result.push({ line: lines[i], showEllipsis: false });
  }

  // Add ellipsis if there's a gap
  if (lines.length > startContext + contextCount) {
    result.push({ line: "", showEllipsis: true });
  }

  // Show last N context lines (unless this is the last change)
  const endContext = isLast ? 0 : contextCount;
  const startIdx = Math.max(lines.length - endContext, startContext);
  for (let i = startIdx; i < lines.length; i++) {
    result.push({ line: lines[i], showEllipsis: false });
  }

  return result;
}

/**
 * Get a summary of changes (for display header).
 */
export function getDiffSummary(original: string | undefined, modified: string): string {
  if (original === undefined || original === "") {
    const lines = modified.split("\n").length;
    return `+${lines} lines (new file)`;
  }

  const changes = diffLines(original, modified);
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
