/**
 * Tests for diff renderer.
 */

import { describe, it, expect } from "vitest";
import { renderDiff, getDiffSummary } from "./diff-renderer.js";

describe("renderDiff", () => {
  it("renders new file with all lines as additions", () => {
    const result = renderDiff(undefined, "line1\nline2\nline3");

    expect(result).toContain("+ line1");
    expect(result).toContain("+ line2");
    expect(result).toContain("+ line3");
  });

  it("renders empty original as new file", () => {
    const result = renderDiff("", "new content");

    expect(result).toContain("+ new content");
  });

  it("renders additions in green", () => {
    const original = "line1";
    const modified = "line1\nline2";
    const result = renderDiff(original, modified);

    // Should contain the added line
    expect(result).toContain("+ line2");
  });

  it("renders removals in red", () => {
    const original = "line1\nline2";
    const modified = "line1";
    const result = renderDiff(original, modified);

    // Should contain the removed line
    expect(result).toContain("- line2");
  });

  it("shows unchanged context lines", () => {
    const original = "context\nold line\nmore context";
    const modified = "context\nnew line\nmore context";
    const result = renderDiff(original, modified);

    // Should contain context and changes
    expect(result).toContain("context");
    expect(result).toContain("- old line");
    expect(result).toContain("+ new line");
  });

  it("respects lineNumbers option", () => {
    const result = renderDiff(undefined, "line1\nline2", { lineNumbers: false });

    // Should not contain padded numbers (4-digit numbers followed by space)
    expect(result).not.toMatch(/\d{4}\s+\d{4}/);
  });

  it("truncates output at maxLines", () => {
    const longContent = Array(50).fill("line").join("\n");
    const result = renderDiff(undefined, longContent, { maxLines: 10 });

    expect(result).toContain("truncated");
    // Should have limited lines
    const lineCount = result.split("\n").length;
    expect(lineCount).toBeLessThanOrEqual(15); // 10 + truncation message
  });

  it("handles modifications in the middle of file", () => {
    const original = "start\nmiddle\nend";
    const modified = "start\nchanged\nend";
    const result = renderDiff(original, modified);

    expect(result).toContain("- middle");
    expect(result).toContain("+ changed");
    expect(result).toContain("start");
    expect(result).toContain("end");
  });
});

describe("getDiffSummary", () => {
  it("returns new file summary for undefined original", () => {
    const result = getDiffSummary(undefined, "line1\nline2");

    expect(result).toContain("new file");
    expect(result).toContain("+2 lines");
  });

  it("returns new file summary for empty original", () => {
    const result = getDiffSummary("", "single line");

    expect(result).toContain("new file");
  });

  it("shows added and removed counts", () => {
    const original = "line1\nline2";
    const modified = "line1\nline3\nline4";
    const result = getDiffSummary(original, modified);

    // Should show additions and removals
    expect(result).toMatch(/\+\d+/);
    expect(result).toMatch(/-\d+/);
  });

  it("counts blank lines in additions/removals", () => {
    const original = "line1\nline2\n";
    const modified = "line1\n\nline2\n";
    const result = getDiffSummary(original, modified);

    expect(result).toMatch(/\+1/);
    expect(result).not.toMatch(/-\d+/);
  });

  it("returns 'no changes' for identical content", () => {
    const content = "same content";
    const result = getDiffSummary(content, content);

    expect(result).toBe("no changes");
  });

  it("shows only additions when nothing removed", () => {
    // Both have trailing newline to avoid spurious diff from newline handling
    const original = "line1\n";
    const modified = "line1\nline2\n";
    const result = getDiffSummary(original, modified);

    expect(result).toMatch(/\+\d+/);
    // Should not contain removal marker
    expect(result).not.toMatch(/-\d+/);
  });
});
