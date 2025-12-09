/**
 * System message component
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/index.js";

export interface SystemMessageProps {
  content: string;
}

export function SystemMessage({
  content,
}: SystemMessageProps): React.ReactElement {
  const theme = useTheme();

  return (
    <Box>
      <Text color={theme.colors.text.muted}>[System] {content}</Text>
    </Box>
  );
}
