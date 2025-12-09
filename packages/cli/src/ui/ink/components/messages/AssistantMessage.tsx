/**
 * Assistant message component
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/index.js";

export interface AssistantMessageProps {
  content: string;
  isStreaming?: boolean;
}

export function AssistantMessage({
  content,
  isStreaming = false,
}: AssistantMessageProps): React.ReactElement {
  const theme = useTheme();

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.colors.status.success}
      paddingX={1}
    >
      <Box>
        <Text color={theme.colors.status.success} bold>
          Golem
        </Text>
        {isStreaming && (
          <Text color={theme.colors.text.muted}> (streaming...)</Text>
        )}
      </Box>
      <Text color={theme.colors.text.primary}>{content}</Text>
    </Box>
  );
}
