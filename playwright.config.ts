import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;
const localBaseUrl = "http://127.0.0.1:3110";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["production/**"],
  outputDir: "output/playwright/test-results",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ["list"],
    ["html", { outputFolder: "output/playwright/report", open: "never" }],
  ],
  use: {
    baseURL: externalBaseUrl ?? localBaseUrl,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "pnpm dev --hostname 127.0.0.1 --port 3110",
        url: `${localBaseUrl}/api/health`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          NEXT_PUBLIC_USE_MOCK_DATA: "true",
          NEXT_PUBLIC_USE_MOCK_AI: "true",
          NEXT_PUBLIC_KAKAO_MAP_KEY: "",
        },
      },
});
