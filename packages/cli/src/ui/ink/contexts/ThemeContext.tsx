/**
 * Theme context for semantic theming in Ink UI
 */

import React, { createContext, useContext, useState, useMemo } from "react";
import type { Theme } from "../themes/types.js";
import { defaultTheme } from "../themes/default.js";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  children: React.ReactNode;
  initialTheme?: Theme;
}

export function ThemeProvider({
  children,
  initialTheme = defaultTheme,
}: ThemeProviderProps): React.ReactElement {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context.theme;
}

export function useThemeActions(): { setTheme: (theme: Theme) => void } {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useThemeActions must be used within a ThemeProvider");
  }
  return { setTheme: context.setTheme };
}
