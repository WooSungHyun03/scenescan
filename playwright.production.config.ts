import { defineConfig, devices } from "@playwright/test";

const productionBaseUrl =
  process.env.PRODUCTION_BASE_URL?.trim() || "https://beceleb.org";

export default defineConfig({
  testDir: "./e2e/production",
  outputDir: "output/playwright/production-smoke/test-results",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: "output/playwright/production-smoke/report",
        open: "never",
      },
    ],
  ],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: productionBaseUrl,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
