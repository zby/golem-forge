/**
 * Tool result display component
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/index.js";
import type { ToolResultData } from "@golem-forge/ui-react";

export interface ToolResultDisplayProps {
  result: ToolResultData;
  maxContentLength?: number;
}

export function ToolResultDisplay({
  result,
  maxContentLength = 200,
}: ToolResultDisplayProps): React.ReactElement {
  const theme = useTheme();

  const truncate = (str: string): string => {
    if (str.length <= maxContentLength) return str;
    return str.slice(0, maxContentLength) + "...";
  };

  // Error status
  if (result.status === "error") {
    return (
      <Box flexDirection="column">
        <Box>
          <Text color={theme.colors.status.error}>x </Text>
          <Text bold>{result.toolName}</Text>
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
        <Text color={theme.colors.status.warning}> interrupted</Text>
        <Text color={theme.colors.text.muted}> ({result.durationMs}ms)</Text>
      </Box>
    );
  }

  // Success - show summary if available
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={theme.colors.status.success}>+ </Text>
        <Text bold>{result.toolName}</Text>
        <Text color={theme.colors.text.muted}> ({result.durationMs}ms)</Text>
      </Box>
      {result.summary && (
        <Box paddingLeft={2}>
          <Text color={theme.colors.text.primary}>{truncate(result.summary)}</Text>
        </Box>
      )}
    </Box>
  );
}
