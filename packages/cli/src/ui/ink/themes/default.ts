/**
 * Default dark theme for Ink UI
 */

import type { Theme } from "./types.js";

export const defaultTheme: Theme = {
  name: "default",
  palette: {
    background: "#1e1e1e",
    foreground: "#d4d4d4",
    black: "#000000",
    red: "#f44747",
    green: "#6a9955",
    yellow: "#dcdcaa",
    blue: "#569cd6",
    magenta: "#c586c0",
    cyan: "#4ec9b0",
    white: "#ffffff",
    gray: "#808080",
  },
  colors: {
    text: {
      primary: "white",
      secondary: "gray",
      muted: "gray",
      accent: "cyan",
    },
    status: {
      success: "green",
      error: "red",
      warning: "yellow",
      info: "blue",
    },
    border: {
      default: "gray",
      focused: "cyan",
      muted: "gray",
    },
    worker: {
      active: "yellow",
      pending: "gray",
      complete: "green",
      error: "red",
    },
    risk: {
      low: "green",
      medium: "yellow",
      high: "red",
    },
    diff: {
      added: "green",
      removed: "red",
      context: "gray",
    },
  },
};
