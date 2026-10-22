import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a production build on a throwaway database.
 *   E2E_DATABASE_URL=postgres://postgres@localhost:5432/worktracker_test npm run build
 *   E2E_DATABASE_URL=... npx playwright test
 * The global setup wipes that database first, so never point it at real data.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const DB = process.env.E2E_DATABASE_URL ?? "postgres://postgres@localhost:5432/worktracker_test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    ...devices["Desktop Chrome"],
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { DATABASE_URL: DB, SETUP_CODE: "e2e-setup-code", CRON_SECRET: "e2e-cron-secret", NODE_ENV: "production" },
  },
});
