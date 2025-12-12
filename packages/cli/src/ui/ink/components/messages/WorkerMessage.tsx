/**
 * Worker message components
 *
 * Shows worker lifecycle events in the message stream.
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/index.js";

export interface WorkerStartMessageProps {
  workerId: string;
  task: string;
  model?: string;
  tools?: string[];
}

export function WorkerStartMessage({
  workerId,
  task,
  model,
  tools,
}: WorkerStartMessageProps): React.ReactElement {
  const theme = useTheme();

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={theme.colors.worker.active}>&gt; </Text>
        <Text color={theme.colors.text.secondary}>Worker </Text>
        <Text color={theme.colors.text.accent}>{workerId}</Text>
        <Text color={theme.colors.text.secondary}> started: </Text>
        <Text color={theme.colors.text.primary}>{task}</Text>
      </Box>
      {model && (
        <Box marginLeft={2}>
          <Text color={theme.colors.text.secondary}>  Model: </Text>
          <Text color={theme.colors.text.primary}>{model}</Text>
        </Box>
      )}
      {tools && tools.length > 0 && (
        <Box marginLeft={2}>
          <Text color={theme.colors.text.secondary}>  Tools: </Text>
          <Text color={theme.colors.text.primary}>{tools.join(", ")}</Text>
        </Box>
      )}
    </Box>
  );
}

export interface WorkerCompleteMessageProps {
  workerId: string;
  success: boolean;
}

export function WorkerCompleteMessage({
  workerId,
  success,
}: WorkerCompleteMessageProps): React.ReactElement {
  const theme = useTheme();

  const icon = success ? "+" : "x";
  const color = success
    ? theme.colors.worker.complete
    : theme.colors.worker.error;
  const status = success ? "completed" : "failed";

  return (
    <Box>
      <Text color={color}>{icon} </Text>
      <Text color={theme.colors.text.secondary}>Worker </Text>
      <Text color={theme.colors.text.accent}>{workerId}</Text>
      <Text color={theme.colors.text.secondary}> {status}</Text>
    </Box>
  );
}
