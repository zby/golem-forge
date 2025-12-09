/**
 * Approval dialog component
 *
 * Modal dialog for approving tool executions with worker path context.
 */

import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../../contexts/index.js";
import type { ApprovalRequiredEvent, WorkerInfo } from "@golem-forge/core";

/**
 * Pending approval data extending the event with timestamp
 */
export interface PendingApprovalData extends ApprovalRequiredEvent {
  timestamp: number;
}

export interface ApprovalDialogProps {
  request: PendingApprovalData;
  onResult: (result: ApprovalResult) => void;
}

export interface ApprovalResult {
  approved: boolean | "always" | "session";
  reason?: string;
}

export function ApprovalDialog({
  request,
  onResult,
}: ApprovalDialogProps): React.ReactElement {
  const theme = useTheme();
  const [selected, setSelected] = useState(0);

  const options = [
    { key: "y", label: "[y]es", result: { approved: true } as ApprovalResult },
    { key: "n", label: "[n]o", result: { approved: false } as ApprovalResult },
    {
      key: "a",
      label: "[a]lways",
      result: { approved: "always" as const } as ApprovalResult,
    },
    {
      key: "s",
      label: "[s]ession",
      result: { approved: "session" as const } as ApprovalResult,
    },
  ];

  useInput((input, key) => {
    // Direct key shortcuts
    const option = options.find((o) => o.key === input.toLowerCase());
    if (option) {
      onResult(option.result);
      return;
    }

    // Arrow key navigation
    if (key.leftArrow) {
      setSelected((s) => Math.max(0, s - 1));
    } else if (key.rightArrow) {
      setSelected((s) => Math.min(options.length - 1, s + 1));
    } else if (key.return) {
      onResult(options[selected].result);
    } else if (key.escape) {
      onResult({ approved: false });
    }
  });

  const riskColor = theme.colors.risk[request.risk];

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.colors.status.warning}
      paddingX={1}
    >
      {/* Header */}
      <Box marginBottom={1}>
        <Text color={theme.colors.status.warning} bold>
          APPROVAL REQUIRED
        </Text>
      </Box>

      {/* Request details */}
      <Box>
        <Text bold>Type: </Text>
        <Text color={theme.colors.text.primary}>{request.type}</Text>
      </Box>

      <Box>
        <Text bold>Description: </Text>
        <Text color={theme.colors.text.primary}>{request.description}</Text>
      </Box>

      <Box>
        <Text bold>Risk: </Text>
        <Text color={riskColor}>{request.risk}</Text>
      </Box>

      {/* Worker path (delegation chain) */}
      {request.workerPath && request.workerPath.length > 1 && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Worker Path:</Text>
          <WorkerPathDisplay path={request.workerPath} />
        </Box>
      )}

      {/* Details */}
      {request.details !== undefined && request.details !== null && (
        <Box flexDirection="column" marginTop={1}>
          <Text bold>Details:</Text>
          <Text color={theme.colors.text.muted}>
            {String(
              typeof request.details === "string"
                ? request.details
                : JSON.stringify(request.details, null, 2)
            )}
          </Text>
        </Box>
      )}

      {/* Options */}
      <Box marginTop={1} gap={2}>
        {options.map((opt, i) => (
          <Text
            key={opt.key}
            inverse={i === selected}
            color={i === selected ? theme.colors.text.accent : undefined}
          >
            {opt.label}
          </Text>
        ))}
      </Box>

      {/* Help text */}
      <Box marginTop={1}>
        <Text color={theme.colors.text.muted}>
          Press key or use arrows + enter
        </Text>
      </Box>
    </Box>
  );
}

/**
 * Display the worker delegation chain
 */
interface WorkerPathDisplayProps {
  path: WorkerInfo[];
}

function WorkerPathDisplay({
  path,
}: WorkerPathDisplayProps): React.ReactElement {
  const theme = useTheme();

  if (!path || path.length === 0) {
    return <></>;
  }

  return (
    <Box flexDirection="column" paddingLeft={1}>
      {path.map((worker: WorkerInfo, i: number) => (
        <Box key={worker.id}>
          <Text color={theme.colors.text.muted}>
            {"  ".repeat(worker.depth)}
            {i === path.length - 1 ? "|- " : "|- "}
          </Text>
          <Text color={theme.colors.worker.active}>{worker.task}</Text>
        </Box>
      ))}
    </Box>
  );
}
