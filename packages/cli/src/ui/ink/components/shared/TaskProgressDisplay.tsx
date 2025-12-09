/**
 * Task progress display components
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme, useWorkerList } from "../../contexts/index.js";
import type { TaskProgress, WorkerNode } from "@golem-forge/ui-react";

export interface TaskProgressDisplayProps {
  task: TaskProgress;
}

/**
 * Display a single task's progress
 */
export function TaskProgressDisplay({
  task,
}: TaskProgressDisplayProps): React.ReactElement {
  const theme = useTheme();
  const indent = "  ".repeat(task.depth);

  const statusConfig = {
    pending: { symbol: "o", color: theme.colors.worker.pending },
    running: { symbol: "*", color: theme.colors.worker.active },
    complete: { symbol: "+", color: theme.colors.worker.complete },
    error: { symbol: "x", color: theme.colors.worker.error },
  };

  const { symbol, color } = statusConfig[task.status];

  return (
    <Box>
      <Text>{indent}</Text>
      <Text color={color}>{symbol}</Text>
      <Text color={theme.colors.text.primary}> {task.task}</Text>
    </Box>
  );
}

/**
 * Display the full worker tree
 */
export function WorkerTreeDisplay(): React.ReactElement {
  const workers = useWorkerList();

  if (workers.length === 0) {
    return <Text>No active workers</Text>;
  }

  // Sort by depth to ensure proper hierarchy display
  const sorted = [...workers].sort((a, b) => a.depth - b.depth);

  return (
    <Box flexDirection="column">
      {sorted.map((worker) => (
        <WorkerNodeDisplay key={worker.id} worker={worker} />
      ))}
    </Box>
  );
}

interface WorkerNodeDisplayProps {
  worker: WorkerNode;
}

function WorkerNodeDisplay({
  worker,
}: WorkerNodeDisplayProps): React.ReactElement {
  const theme = useTheme();
  const indent = "  ".repeat(worker.depth);

  const statusConfig = {
    pending: { symbol: "o", color: theme.colors.worker.pending },
    running: { symbol: "*", color: theme.colors.worker.active },
    complete: { symbol: "+", color: theme.colors.worker.complete },
    error: { symbol: "x", color: theme.colors.worker.error },
  };

  const { symbol, color } = statusConfig[worker.status];

  return (
    <Box>
      <Text>{indent}</Text>
      <Text color={color}>{symbol}</Text>
      <Text color={theme.colors.text.primary}> {worker.task}</Text>
      <Text color={theme.colors.text.muted}> [{worker.id}]</Text>
    </Box>
  );
}
