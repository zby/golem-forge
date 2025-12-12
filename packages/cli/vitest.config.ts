import { defineConfig } from "vitest/config";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@golem-forge/core": path.resolve(__dirname, "../core/src/index.ts"),
      "@golem-forge/ui-react": path.resolve(__dirname, "../ui-react/src/index.ts"),
    },
  },
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
