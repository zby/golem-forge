import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Integration tests only
    include: ["src/**/*.integration.test.ts"],
    // Longer timeout for LLM calls
    testTimeout: 60000,
  },
});
