import { defineConfig, devices } from "@playwright/test";

// Runs against a server that is already up: scripts/verify.sh builds the app, starts it with a throwaway
// Postgres and sets E2E_BASE_URL and E2E_OUTBOX_DIR.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "on-first-retry" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } } },
  ],
});
