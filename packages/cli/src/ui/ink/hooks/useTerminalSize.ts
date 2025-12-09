/**
 * Hook for tracking terminal dimensions
 */

import { useState, useEffect } from "react";
import { useStdout } from "ink";

export interface TerminalSize {
  columns: number;
  rows: number;
}

/**
 * Get current terminal size and update on resize
 */
export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();

  const [size, setSize] = useState<TerminalSize>(() => ({
    columns: stdout?.columns ?? 80,
    rows: stdout?.rows ?? 24,
  }));

  useEffect(() => {
    if (!stdout) return;

    const handleResize = () => {
      setSize({
        columns: stdout.columns,
        rows: stdout.rows,
      });
    };

    stdout.on("resize", handleResize);
    return () => {
      stdout.off("resize", handleResize);
    };
  }, [stdout]);

  return size;
}

/**
 * Check if terminal is narrow (< threshold columns)
 */
export function useIsNarrow(threshold = 80): boolean {
  const { columns } = useTerminalSize();
  return columns < threshold;
}

/**
 * Calculate available width after accounting for padding/borders
 */
export function useAvailableWidth(padding = 2): number {
  const { columns } = useTerminalSize();
  return Math.max(columns - padding * 2, 20);
}
