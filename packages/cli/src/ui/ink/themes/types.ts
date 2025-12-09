/**
 * Theme type definitions for Ink UI
 *
 * Three-layer theming system:
 * 1. Color palette - base colors
 * 2. Semantic tokens - purpose-based colors
 * 3. Component tokens - component-specific styles
 */

/**
 * Base color palette
 */
export interface ColorPalette {
  background: string;
  foreground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  gray: string;
}

/**
 * Semantic color tokens - colors by purpose
 */
export interface SemanticColors {
  text: {
    primary: string;
    secondary: string;
    muted: string;
    accent: string;
  };
  status: {
    success: string;
    error: string;
    warning: string;
    info: string;
  };
  border: {
    default: string;
    focused: string;
    muted: string;
  };
  // Worker-specific colors
  worker: {
    active: string;
    pending: string;
    complete: string;
    error: string;
  };
  // Risk level colors for approvals
  risk: {
    low: string;
    medium: string;
    high: string;
  };
  // Diff colors
  diff: {
    added: string;
    removed: string;
    context: string;
  };
}

/**
 * Complete theme definition
 */
export interface Theme {
  name: string;
  palette: ColorPalette;
  colors: SemanticColors;
}

/**
 * Type for color values used in Ink components
 */
export type InkColor =
  | "black"
  | "red"
  | "green"
  | "yellow"
  | "blue"
  | "magenta"
  | "cyan"
  | "white"
  | "gray"
  | "grey"
  | `#${string}`;
