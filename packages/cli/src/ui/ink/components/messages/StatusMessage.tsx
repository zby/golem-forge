/**
 * Status message component
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/index.js";
import type { StatusUpdate } from "@golem-forge/ui-react";

export interface StatusMessageProps {
  status: StatusUpdate;
}

export function StatusMessage({
  status,
}: StatusMessageProps): React.ReactElement {
  const theme = useTheme();

  const config = {
    info: { symbol: "i", color: theme.colors.status.info },
    warning: { symbol: "!", color: theme.colors.status.warning },
    error: { symbol: "x", color: theme.colors.status.error },
  };

  const { symbol, color } = config[status.type];

  return (
    <Box>
      <Text color={color}>{symbol} </Text>
      <Text color={theme.colors.text.primary}>{status.message}</Text>
    </Box>
  );
}
