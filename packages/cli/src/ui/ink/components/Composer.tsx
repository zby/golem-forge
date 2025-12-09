/**
 * Composer component
 *
 * Main UI orchestrator - renders the appropriate content based on UI state.
 */

import React from "react";
import { Box, Text } from "ink";
import {
  useTheme,
  useUIMode,
  useUIStateActions,
  useHasPendingApproval,
  useInkUIState,
  useInkUIStateActions,
} from "../contexts/index.js";
import { MainContent } from "./layout/MainContent.js";
import { InputPrompt } from "./layout/InputPrompt.js";

export function Composer(): React.ReactElement {
  const theme = useTheme();
  const mode = useUIMode();
  const { setMode } = useUIStateActions();
  const hasPendingApproval = useHasPendingApproval();
  const inkUIState = useInkUIState();
  const inkUIActions = useInkUIStateActions();

  // Handle input submission
  const handleInputSubmit = (value: string) => {
    if (inkUIState.inputPrompt?.resolve) {
      inkUIState.inputPrompt.resolve(value);
    }
    inkUIActions.clearInputPrompt();
    setMode("idle");
  };

  return (
    <Box flexDirection="column" flexGrow={1}>
      {/* Main content area - messages, tool results, etc. */}
      <MainContent />

      {/* Input prompt when in input mode */}
      {mode === "input" && inkUIState.inputPrompt && (
        <InputPrompt
          prompt={inkUIState.inputPrompt.prompt}
          onSubmit={handleInputSubmit}
        />
      )}

      {/* Idle state hint */}
      {mode === "idle" && !hasPendingApproval && (
        <Box marginTop={1}>
          <Text color={theme.colors.text.muted}>
            Ctrl+C to exit
          </Text>
        </Box>
      )}
    </Box>
  );
}
