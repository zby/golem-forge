/**
 * Input prompt component for Ink UI
 */

import React from "react";
import { Box, Text } from "ink";
import { TextInput } from "@inkjs/ui";
import { useTheme } from "../../contexts/index.js";

export interface InputPromptProps {
  prompt?: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
}

export function InputPrompt({
  prompt = "> ",
  placeholder = "Type here...",
  onSubmit,
}: InputPromptProps): React.ReactElement {
  const theme = useTheme();

  return (
    <Box>
      <Text color={theme.colors.text.accent}>{prompt}</Text>
      <TextInput placeholder={placeholder} onSubmit={onSubmit} />
    </Box>
  );
}

export interface ContinuePromptProps {
  onContinue: () => void;
  message?: string;
}

export function ContinuePrompt({
  onContinue,
  message = "Press Enter to continue...",
}: ContinuePromptProps): React.ReactElement {
  const theme = useTheme();

  // Use ink's useInput via a simple TextInput that submits on Enter
  return (
    <Box marginTop={1}>
      <Text color={theme.colors.text.muted}>{message}</Text>
      <TextInput
        placeholder=""
        onSubmit={() => onContinue()}
      />
    </Box>
  );
}
