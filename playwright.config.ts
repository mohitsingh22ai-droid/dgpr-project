import { defineConfig, devices } from "@playwright/test";

/**
 * E2E configuration.
 *
 * - Tests run against their own data directory (`.data-e2e`), reseeded before the
 *   dev server starts, so a run never touches local development data or tracked files.
 * - Emails are captured locally (EMAIL_PROVIDER=test); no real mail is sent.
 * - Set PW_CHROMIUM_EXECUTABLE to use a preinstalled Chromium instead of the
 *   one bundled with this Playwright version.
 */
const PORT = Number(process.env.E2E_PORT || 3000);
const BASE_URL = `http://localhost:${PORT}`;

// Shared by the test runner (specs that import server modules) and the dev server.
process.env.W2P_DATA_DIR = process.env.W2P_DATA_DIR || ".data-e2e";
process.env.EMAIL_PROVIDER = "test";
// Webhook tests sign events with this secret; the dev server verifies with the same value.
process.env.STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "whsec_e2e_local_test_secret";
// Specs that call Stripe directly need the key from .env.local.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("@next/env").loadEnvConfig(process.cwd());

const launchOptions = process.env.PW_CHROMIUM_EXECUTABLE
  ? { executablePath: process.env.PW_CHROMIUM_EXECUTABLE }
  : {};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0, // No retries-until-green: a failure must be explained, not re-rolled.
  workers: 1, // Specs share one server-side data directory.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["json", { outputFile: "playwright-report/test-results.json" }],
  ],
  use: {
    baseURL: BASE_URL,
    trace: "off",
    screenshot: "only-on-failure",
    video: "off",
    launchOptions,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "tablet", use: { ...devices["Galaxy Tab S4"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `npm run seed && npx next dev -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      W2P_DATA_DIR: process.env.W2P_DATA_DIR,
      EMAIL_PROVIDER: "test",
      STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
      NEXT_PUBLIC_APP_URL: BASE_URL,
    },
  },
});
