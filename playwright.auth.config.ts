import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

function readExampleEnvironment(): Record<string, string> {
  const values: Record<string, string> = {};
  const source = readFileSync(resolve(process.cwd(), ".env.integration.example"), "utf8");
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return values;
}

const local = readExampleEnvironment();
const baseURL = "http://127.0.0.1:3111";

export default defineConfig({
  testDir: fileURLToPath(new URL("./e2e/auth-local", import.meta.url)),
  testMatch: "**/account-flow.spec.ts",
  outputDir: "output/playwright/auth-local/test-results",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  // Full signup/mail/recovery/two-account/shortlist/deletion flow includes
  // cold dev compilation. Individual assertions retain the 10-second limit.
  timeout: 120_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "output/playwright/auth-local/report", open: "never" }],
  ],
  use: {
    ...devices["Desktop Chrome"],
    actionTimeout: 10_000,
    baseURL,
    locale: "ko-KR",
    timezoneId: "Asia/Seoul",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "pnpm dev --hostname 127.0.0.1 --port 3111",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      NEXT_PUBLIC_SUPABASE_URL: local.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: local.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_USE_MOCK_DATA: "true",
      NEXT_PUBLIC_USE_MOCK_AI: "true",
      NEXT_PUBLIC_KAKAO_MAP_KEY: "",
      SUPABASE_URL: local.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: local.SUPABASE_SERVICE_ROLE_KEY,
    },
  },
});
