/**
 * Diff display components
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/index.js";

export interface DiffContent {
  path: string;
  original?: string;
  modified: string;
  isNew: boolean;
}

export interface DiffSummary {
  path: string;
  operation: "create" | "update" | "delete";
  additions: number;
  deletions: number;
}

export interface DiffViewProps {
  diff: DiffContent;
  maxLines?: number;
}

/**
 * Display a diff with line-by-line changes
 */
export function DiffView({
  diff,
  maxLines = 20,
}: DiffViewProps): React.ReactElement {
  const theme = useTheme();

  const originalLines = (diff.original || "").split("\n");
  const modifiedLines = diff.modified.split("\n");

  // Simple diff: show changes
  const changes: Array<{ type: "add" | "remove" | "context"; line: string }> =
    [];

  if (diff.isNew) {
    // New file - all lines are additions
    for (const line of modifiedLines) {
      changes.push({ type: "add", line });
    }
  } else {
    // Modified file - simplified view
    const contextLines = Math.min(originalLines.length, modifiedLines.length);

    for (let i = 0; i < contextLines; i++) {
      if (originalLines[i] !== modifiedLines[i]) {
        if (originalLines[i]) {
          changes.push({ type: "remove", line: originalLines[i] });
        }
        if (modifiedLines[i]) {
          changes.push({ type: "add", line: modifiedLines[i] });
        }
      } else {
        changes.push({ type: "context", line: originalLines[i] });
      }
    }

    // Handle length differences
    for (let i = contextLines; i < originalLines.length; i++) {
      changes.push({ type: "remove", line: originalLines[i] });
    }
    for (let i = contextLines; i < modifiedLines.length; i++) {
      changes.push({ type: "add", line: modifiedLines[i] });
    }
  }

  const headerColor = diff.isNew
    ? theme.colors.diff.added
    : theme.colors.status.warning;

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={theme.colors.border.default}
      paddingX={1}
    >
      <Box marginBottom={1}>
        <Text color={headerColor} bold>
          {diff.isNew ? "NEW" : "MODIFIED"}: {diff.path}
        </Text>
      </Box>

      {changes.slice(0, maxLines).map((change, i) => (
        <DiffLine key={i} type={change.type} line={change.line} />
      ))}

      {changes.length > maxLines && (
        <Text color={theme.colors.text.muted}>
          ... and {changes.length - maxLines} more lines
        </Text>
      )}
    </Box>
  );
}

interface DiffLineProps {
  type: "add" | "remove" | "context";
  line: string;
}

function DiffLine({ type, line }: DiffLineProps): React.ReactElement {
  const theme = useTheme();

  const config = {
    add: { prefix: "+", color: theme.colors.diff.added },
    remove: { prefix: "-", color: theme.colors.diff.removed },
    context: { prefix: " ", color: theme.colors.diff.context },
  };

  const { prefix, color } = config[type];

  return (
    <Box>
      <Text color={color}>
        {prefix} {line}
      </Text>
    </Box>
  );
}

export interface DiffSummaryListProps {
  summaries: DiffSummary[];
}

/**
 * Display a summary of file changes
 */
export function DiffSummaryList({
  summaries,
}: DiffSummaryListProps): React.ReactElement {
  const theme = useTheme();

  if (summaries.length === 0) {
    return <Text color={theme.colors.text.muted}>No changes</Text>;
  }

  return (
    <Box flexDirection="column">
      {summaries.map((s, i) => (
        <DiffSummaryRow key={i} summary={s} />
      ))}
    </Box>
  );
}

interface DiffSummaryRowProps {
  summary: DiffSummary;
}

function DiffSummaryRow({ summary }: DiffSummaryRowProps): React.ReactElement {
  const theme = useTheme();

  const opConfig = {
    create: { symbol: "A", color: theme.colors.diff.added },
    update: { symbol: "M", color: theme.colors.status.warning },
    delete: { symbol: "D", color: theme.colors.diff.removed },
  };

  const { symbol, color } = opConfig[summary.operation];

  const stats = [];
  if (summary.additions > 0) stats.push(`+${summary.additions}`);
  if (summary.deletions > 0) stats.push(`-${summary.deletions}`);

  return (
    <Box gap={1}>
      <Text color={color}>{symbol}</Text>
      <Text color={theme.colors.text.primary}>{summary.path}</Text>
      <Text color={theme.colors.text.muted}>
        ({stats.join(" ") || "no changes"})
      </Text>
    </Box>
  );
}
