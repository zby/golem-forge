import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Default: run unit tests only (exclude integration tests)
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "examples/**/*.test.ts"],
    exclude: ["src/**/*.integration.test.ts", "node_modules"],
    pool: "forks",
    fileParallelism: false,
    env: {
      ANTHROPIC_API_KEY: "test",
      OPENAI_API_KEY: "test",
    },
  },
});
