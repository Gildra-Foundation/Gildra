import path from "node:path";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      "@payload-config": path.resolve(root, "src/payload.config.ts"),
      "@": path.resolve(root, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Each integration file boots Payload against its own scratch database.
    pool: "forks",
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 300_000,
  },
});
