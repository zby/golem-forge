/**
 * Footer component for Ink UI
 *
 * Shows: worker status | model | context usage
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme, useInkUIState, useWorkerList, useActiveWorker } from "../../contexts/index.js";
import { useIsNarrow } from "../../hooks/index.js";

export interface FooterProps {
  cwd?: string;
  branch?: string;
}

export function Footer({ cwd, branch }: FooterProps): React.ReactElement {
  const theme = useTheme();
  const inkUIState = useInkUIState();
  const workers = useWorkerList();
  const activeWorker = useActiveWorker();
  const isNarrow = useIsNarrow(80);

  // Worker stats
  const activeCount = workers.filter((w) => w.status === "running").length;
  const totalCount = workers.length;

  // Format CWD (shorten home directory)
  const formatCwd = (path: string): string => {
    const home = process.env.HOME || "";
    if (path.startsWith(home)) {
      return "~" + path.slice(home.length);
    }
    return path;
  };

  return (
    <Box
      borderStyle="single"
      borderColor={theme.colors.border.default}
      paddingX={1}
      justifyContent="space-between"
    >
      {/* Left: CWD + branch */}
      <Box gap={1}>
        {cwd && (
          <Text color={theme.colors.text.secondary}>
            {formatCwd(cwd)}
          </Text>
        )}
        {branch && (
          <Text color={theme.colors.text.accent}>({branch})</Text>
        )}
      </Box>

      {/* Center: Worker status */}
      {!isNarrow && totalCount > 0 && (
        <Box gap={1}>
          <Text color={theme.colors.text.secondary}>workers:</Text>
          <Text
            color={
              activeCount > 0
                ? theme.colors.worker.active
                : theme.colors.text.muted
            }
          >
            {activeCount}/{totalCount}
          </Text>
          {activeWorker && (
            <Text color={theme.colors.text.muted}>
              ({activeWorker.task.slice(0, 20)}
              {activeWorker.task.length > 20 ? "..." : ""})
            </Text>
          )}
        </Box>
      )}

      {/* Right: Model + context */}
      <Box gap={1}>
        <Text color={theme.colors.text.secondary}>{inkUIState.modelName}</Text>
        <Text color={theme.colors.text.muted}>|</Text>
        <ContextUsage usage={inkUIState.contextUsage} />
      </Box>
    </Box>
  );
}

interface ContextUsageProps {
  usage: number;
}

function ContextUsage({ usage }: ContextUsageProps): React.ReactElement {
  const theme = useTheme();
  const isNarrow = useIsNarrow(100);

  // Color based on usage level
  const color =
    usage > 80
      ? theme.colors.status.error
      : usage > 60
        ? theme.colors.status.warning
        : theme.colors.status.success;

  const remaining = 100 - usage;
  const label = isNarrow ? "%" : "% ctx";

  return (
    <Text color={color}>
      {remaining}
      {label}
    </Text>
  );
}
