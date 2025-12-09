/**
 * Header component for Ink UI
 */

import React from "react";
import { Box, Text } from "ink";
import { useTheme } from "../../contexts/index.js";
import { useIsNarrow } from "../../hooks/index.js";

export interface HeaderProps {
  title?: string;
  showLogo?: boolean;
}

// Simple ASCII logo variants
const LOGO_FULL = "Golem Forge";
const LOGO_SHORT = "GF";

export function Header({
  title,
  showLogo = true,
}: HeaderProps): React.ReactElement {
  const theme = useTheme();
  const isNarrow = useIsNarrow(60);

  const logo = isNarrow ? LOGO_SHORT : LOGO_FULL;

  return (
    <Box
      borderStyle="single"
      borderColor={theme.colors.border.default}
      paddingX={1}
      justifyContent="space-between"
    >
      {showLogo && (
        <Text color={theme.colors.text.accent} bold>
          {logo}
        </Text>
      )}
      {title && (
        <Text color={theme.colors.text.secondary}>{title}</Text>
      )}
    </Box>
  );
}
