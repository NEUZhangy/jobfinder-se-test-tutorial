import { defineConfig, devices } from "@playwright/test";

const PORT = 5199;

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.ts",
  outputDir: "test-results",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  workers: 4,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    video: "on",
    trace: "on",
    screenshot: "on",
    locale: "en-US",
    timezoneId: "UTC",
    colorScheme: "light",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx vite --config vite.config.e2e.ts --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
