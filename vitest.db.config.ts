import { defineConfig } from "vitest/config";
import path from "node:path";

// Database tests: need a migrated Postgres. scripts/verify.sh starts one and sets DATABASE_URL (app role).
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/server-only-stub.ts"),
    },
  },
  test: {
    include: ["tests/db/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    setupFiles: ["tests/db/setup.ts"],
  },
});
