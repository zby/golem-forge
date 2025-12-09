/**
 * Main App component for Ink UI
 *
 * Sets up all context providers and renders the main layout.
 */

import React from "react";
import { Box, useApp, useInput } from "ink";
import type { UIEventBus } from "@golem-forge/core";
import { UIProvider } from "@golem-forge/ui-react";
import { ThemeProvider } from "../contexts/ThemeContext.js";
import { InkUIStateProvider } from "../contexts/InkUIStateContext.js";
import { Header } from "./layout/Header.js";
import { Footer } from "./layout/Footer.js";
import { Composer } from "./Composer.js";
import type { Theme } from "../themes/types.js";

export interface AppProps {
  /** Event bus for UI communication */
  bus: UIEventBus;
  /** Children components (e.g., controller bridge) */
  children?: React.ReactNode;
  /** Optional initial theme */
  theme?: Theme;
  /** Current working directory for footer */
  cwd?: string;
  /** Git branch for footer */
  branch?: string;
  /** Show header */
  showHeader?: boolean;
  /** Show footer */
  showFooter?: boolean;
  /** Initial model name for footer */
  modelName?: string;
}

export function App({
  bus,
  children,
  theme,
  cwd,
  branch,
  showHeader = true,
  showFooter = true,
  modelName = "claude-sonnet",
}: AppProps): React.ReactElement {
  const { exit } = useApp();

  // Handle global Ctrl+C to exit
  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      exit();
    }
  });

  return (
    <ThemeProvider initialTheme={theme}>
      <UIProvider bus={bus}>
        <InkUIStateProvider initialModelName={modelName}>
          {/* Children for controller bridge */}
          {children}
          <AppLayout
            showHeader={showHeader}
            showFooter={showFooter}
            cwd={cwd}
            branch={branch}
          />
        </InkUIStateProvider>
      </UIProvider>
    </ThemeProvider>
  );
}

interface AppLayoutProps {
  showHeader: boolean;
  showFooter: boolean;
  cwd?: string;
  branch?: string;
}

function AppLayout({
  showHeader,
  showFooter,
  cwd,
  branch,
}: AppLayoutProps): React.ReactElement {
  return (
    <Box flexDirection="column" minHeight={10}>
      {showHeader && <Header />}
      <Composer />
      {showFooter && <Footer cwd={cwd} branch={branch} />}
    </Box>
  );
}
