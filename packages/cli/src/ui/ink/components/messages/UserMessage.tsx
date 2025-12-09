/**
 * User message component
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/index.js";

export interface UserMessageProps {
  content: string;
}

export function UserMessage({ content }: UserMessageProps): React.ReactElement {
  const theme = useTheme();

  return (
    <Box>
      <Text color={theme.colors.status.info} bold>
        You:{" "}
      </Text>
      <Text color={theme.colors.text.primary}>{content}</Text>
    </Box>
  );
}
