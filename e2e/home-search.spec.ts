import { expect, test } from "@playwright/test";
import { collectPageErrors } from "./helpers";

for (const width of [390, 1440]) {
  test(`홈 텍스트 검색과 입력 유지 (${width}px)`, async ({ page }) => {
    const errors = collectPageErrors(page);
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.getByRole("button", { name: "텍스트로 검색", exact: true }).click();
    const input = page.getByLabel("어떤 촬영 장소를 찾으세요?");
    await expect(page.getByRole("button", { name: "장소 검색", exact: true })).toBeDisabled();
    await input.fill("   ");
    await expect(page.getByRole("button", { name: "장소 검색", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "해운대 바다", exact: true }).click();
    await page.getByRole("button", { name: "사진으로 검색", exact: true }).click();
    await expect(page.getByRole("button", { name: "참고 이미지 선택" })).toBeVisible();
    await page.getByRole("button", { name: "텍스트로 검색", exact: true }).click();
    await expect(input).toHaveValue("해운대 바다");
    await input.fill("수영구 자연");
    const response = page.waitForResponse((r) => r.url().endsWith("/api/search/text"));
    await input.press("Enter");
    expect((await response).status()).toBe(200);
    await expect(page).toHaveURL(/\/search$/);
    await expect(page.getByLabel("검색어", { exact: true })).toHaveValue("수영구 자연");
    await expect(page.getByRole("heading", { name: "추천 장소 1곳" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test("홈 텍스트 검색 오류는 입력을 보존하고 재시도할 수 있다", async ({ page }) => {
  await page.route("**/api/search/text", (route) => route.fulfill({ status: 503, json: { error: { code: "DATA_UNAVAILABLE" } } }));
  await page.goto("/");
  await page.getByRole("button", { name: "텍스트로 검색", exact: true }).click();
  await page.getByLabel("어떤 촬영 장소를 찾으세요?").fill("수영구 자연");
  await page.getByRole("button", { name: "장소 검색", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("다시 시도");
  await expect(page.getByLabel("어떤 촬영 장소를 찾으세요?")).toHaveValue("수영구 자연");
  await expect(page.getByRole("button", { name: "장소 검색", exact: true })).toBeEnabled();
});
