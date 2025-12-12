/**
 * Tool result display component
 *
 * Renders tool results with rich content based on result type (kind).
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/index.js";
import type { ToolResultData } from "@golem-forge/ui-react";
import type { ToolResultValue } from "@golem-forge/core";

export interface ToolResultDisplayProps {
  result: ToolResultData;
  maxContentLength?: number;
  /** Maximum lines to show for multi-line content */
  maxLines?: number;
  /** Whether to show full content or collapsed summary */
  expanded?: boolean;
}

export function ToolResultDisplay({
  result,
  maxContentLength = 200,
  maxLines = 5,
  expanded = false,
}: ToolResultDisplayProps): React.ReactElement {
  const theme = useTheme();

  const truncate = (str: string, max?: number): string => {
    const limit = max ?? maxContentLength;
    if (str.length <= limit) return str;
    return str.slice(0, limit) + "...";
  };

  const truncateLines = (str: string): string => {
    const lines = str.split("\n");
    if (lines.length <= maxLines) return str;
    const visibleCount = Math.max(maxLines - 1, 0);
    const visibleLines = lines.slice(0, visibleCount);
    const remaining = lines.length - visibleCount;
    const prefix = visibleLines.length > 0 ? visibleLines.join("\n") + "\n" : "";
    return prefix + `... (${remaining} more lines)`;
  };

  const truncatePreview = (str: string, max?: number): string =>
    truncateLines(truncate(str, max));

  const stringifyArgs = (args: Record<string, unknown>): string => {
    try {
      return JSON.stringify(args, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v
      );
    } catch {
      return "[unserializable args]";
    }
  };

  const argsPreview =
    result.args && Object.keys(result.args).length > 0
      ? truncate(stringifyArgs(result.args), 120)
      : undefined;

  // Error status
  if (result.status === "error") {
    return (
      <Box flexDirection="column">
        <Box>
          <Text color={theme.colors.status.error}>x </Text>
          <Text bold>{result.toolName}</Text>
          {argsPreview && (
            <Text color={theme.colors.text.muted}> ({argsPreview})</Text>
          )}
          <Text color={theme.colors.status.error}> failed</Text>
          <Text color={theme.colors.text.muted}> ({result.durationMs}ms)</Text>
        </Box>
        {result.error && (
          <Box paddingLeft={2}>
            <Text color={theme.colors.status.error}>{truncate(result.error)}</Text>
          </Box>
        )}
      </Box>
    );
  }

  // Interrupted status
  if (result.status === "interrupted") {
    return (
      <Box>
        <Text color={theme.colors.status.warning}>! </Text>
        <Text bold>{result.toolName}</Text>
        {argsPreview && (
          <Text color={theme.colors.text.muted}> ({argsPreview})</Text>
        )}
        <Text color={theme.colors.status.warning}> interrupted</Text>
        <Text color={theme.colors.text.muted}> ({result.durationMs}ms)</Text>
      </Box>
    );
  }

  // Success - render based on value kind
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={theme.colors.status.success}>+ </Text>
        <Text bold>{result.toolName}</Text>
        {argsPreview && (
          <Text color={theme.colors.text.muted}> ({argsPreview})</Text>
        )}
        <Text color={theme.colors.text.muted}> ({result.durationMs}ms)</Text>
      </Box>
      <ResultContent
        value={result.value}
        summary={result.summary}
        theme={theme}
        truncateLines={truncateLines}
        truncatePreview={truncatePreview}
        maxLines={maxLines}
        expanded={expanded}
      />
    </Box>
  );
}

/**
 * Render the content based on result value kind
 */
interface ResultContentProps {
  value?: ToolResultValue;
  summary?: string;
  theme: ReturnType<typeof useTheme>;
  truncateLines: (str: string) => string;
  truncatePreview: (str: string, max?: number) => string;
  maxLines: number;
  expanded: boolean;
}

function ResultContent({
  value,
  summary,
  theme,
  truncateLines,
  truncatePreview,
  maxLines,
  expanded,
}: ResultContentProps): React.ReactElement | null {
  // If no value, fall back to summary
  if (!value) {
    if (summary) {
      return (
        <Box paddingLeft={2}>
          <Text color={theme.colors.text.primary}>{truncatePreview(summary)}</Text>
        </Box>
      );
    }
    return null;
  }

  // Check if should be hidden
  if (value.display?.preferredView === "hidden") {
    return null;
  }

  // Render based on kind
  switch (value.kind) {
    case "text": {
      const textValue = value as { kind: "text"; content: string; summary?: string };
      const content = expanded
        ? truncateLines(textValue.content)
        : truncatePreview(textValue.content);
      return (
        <Box paddingLeft={2} flexDirection="column">
          <Text color={theme.colors.text.primary}>{content}</Text>
        </Box>
      );
    }

    case "diff": {
      const diffValue = value as {
        kind: "diff";
        path: string;
        original?: string;
        modified: string;
        isNew: boolean;
        bytesWritten: number;
        summary?: string;
      };
      const diffRendered =
        diffValue.original !== undefined
          ? renderSimpleDiff(diffValue.original, diffValue.modified)
          : diffValue.modified;
      const collapsedText =
        diffValue.original !== undefined
          ? diffRendered
          : diffValue.summary || diffRendered;
      return (
        <Box paddingLeft={2} flexDirection="column">
          <Box>
            <Text color={theme.colors.text.accent}>{diffValue.path}</Text>
            {diffValue.isNew && <Text color={theme.colors.status.success}> (new)</Text>}
          </Box>
          {expanded ? (
            <Box paddingLeft={2}>
              <Text color={theme.colors.text.muted}>
                {truncateLines(diffRendered)}
              </Text>
            </Box>
          ) : (
            <Box paddingLeft={2}>
              <Text color={theme.colors.text.muted}>
                {truncatePreview(collapsedText)}
              </Text>
            </Box>
          )}
        </Box>
      );
    }

    case "file_content": {
      const fcValue = value as {
        kind: "file_content";
        path: string;
        content: string;
        size: number;
        summary?: string;
      };
      const content = expanded
        ? truncateLines(fcValue.content)
        : truncatePreview(fcValue.content);
      return (
        <Box paddingLeft={2} flexDirection="column">
          <Box>
            <Text color={theme.colors.text.accent}>{fcValue.path}</Text>
            <Text color={theme.colors.text.muted}> ({fcValue.size} bytes)</Text>
          </Box>
          <Box paddingLeft={2}>
            <Text color={theme.colors.text.primary}>{content}</Text>
          </Box>
        </Box>
      );
    }

    case "file_list": {
      const flValue = value as {
        kind: "file_list";
        path: string;
        files: string[];
        count: number;
        summary?: string;
      };
      const limit = Math.max(maxLines, 1);
      const needsMoreLine = flValue.files.length > limit;
      const filesToShow = needsMoreLine
        ? flValue.files.slice(0, Math.max(limit - 1, 0))
        : flValue.files;
      const remaining = flValue.files.length - filesToShow.length;
      return (
        <Box paddingLeft={2} flexDirection="column">
          <Box>
            <Text color={theme.colors.text.accent}>{flValue.path}</Text>
            <Text color={theme.colors.text.muted}> ({flValue.count} entries)</Text>
          </Box>
          <Box paddingLeft={2} flexDirection="column">
            {filesToShow.map((file, i) => (
              <Text key={i} color={theme.colors.text.primary}>
                {file}
              </Text>
            ))}
            {needsMoreLine && remaining > 0 && (
              <Text color={theme.colors.text.muted}>
                ... {remaining} more
              </Text>
            )}
          </Box>
        </Box>
      );
    }

    case "json": {
      const jsonValue = value as { kind: "json"; data: unknown; summary?: string };
      const jsonStr = JSON.stringify(jsonValue.data, null, 2);
      return (
        <Box paddingLeft={2} flexDirection="column">
          <Text color={theme.colors.text.primary}>
            {expanded ? truncateLines(jsonStr) : truncatePreview(jsonStr)}
          </Text>
        </Box>
      );
    }

    default: {
      // Custom result type - show summary or data
      const customValue = value as { kind: string; data?: unknown; summary?: string };
      const displayText = customValue.summary || (customValue.data ? JSON.stringify(customValue.data) : `(${customValue.kind})`);
      return (
        <Box paddingLeft={2}>
          <Text color={theme.colors.text.primary}>
            {expanded ? truncateLines(displayText) : truncatePreview(displayText)}
          </Text>
        </Box>
      );
    }
  }
}

/**
 * Simple diff rendering (basic line-based comparison)
 */
function renderSimpleDiff(original: string, modified: string): string {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");

  const result: string[] = [];
  const maxLines = Math.max(origLines.length, modLines.length);

  for (let i = 0; i < Math.min(maxLines, 20); i++) {
    const origLine = origLines[i];
    const modLine = modLines[i];

    if (origLine === undefined && modLine !== undefined) {
      result.push(`+ ${modLine}`);
    } else if (origLine !== undefined && modLine === undefined) {
      result.push(`- ${origLine}`);
    } else if (origLine !== modLine) {
      result.push(`- ${origLine}`);
      result.push(`+ ${modLine}`);
    }
    // Skip unchanged lines for brevity
  }

  if (maxLines > 20) {
    result.push(`... (${maxLines - 20} more lines)`);
  }

  return result.join("\n") || "(no changes)";
}
