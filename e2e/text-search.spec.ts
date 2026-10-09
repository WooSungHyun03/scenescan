import { expect, test } from "@playwright/test";
import { chooseEvaluationImage, collectPageErrors } from "./helpers";

async function switchToTextMode(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "텍스트로 검색" }).click();
  await expect(page.getByLabel("검색어", { exact: true })).toBeVisible();
}

test("텍스트 검색: 검색 → 결과 → 상세 → 뒤로 가도 결과가 유지된다", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("/search");
  await switchToTextMode(page);

  const textResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/search/text") && response.request().method() === "POST",
  );
  await page.getByLabel("검색어", { exact: true }).fill("산책");
  await page.getByLabel("검색어", { exact: true }).press("Enter");
  expect((await textResponse).status()).toBe(200);

  await expect(page.getByRole("heading", { name: "추천 장소 1곳" })).toBeVisible();
  const card = page.locator("main article").first();
  await expect(card).toBeVisible();
  await expect(card).not.toContainText("유사도");
  await expect(page.getByText(/이름 .산책./)).toBeVisible();
  await expect(page.getByText(/별칭 .산책./)).toBeVisible();
  await expect(page.getByText(/설명 .산책./)).toBeVisible();
  await expect(page.getByText(/태그 .산책./)).toBeVisible();

  const name = (await card.getByRole("heading", { level: 3 }).innerText()).trim();
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page).toHaveURL(/\/locations\//);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByLabel("검색어", { exact: true })).toHaveValue("산책");
  await expect(page.getByRole("heading", { name: "추천 장소 1곳" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("모드를 전환해도 다른 모드의 결과가 섞이지 않고, 각자 유지된다", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("/search");
  await chooseEvaluationImage(page);
  await page.getByRole("button", { name: "이 이미지로 장소 찾기" }).click();
  await expect(page.getByRole("heading", { name: "추천 장소 8곳" })).toBeVisible();

  await switchToTextMode(page);
  // Switching to text mode must not show the 8 image results -- it falls
  // back to catalog browsing (its own, separate set of cards) since no
  // text search has run yet.
  await expect(page.getByRole("heading", { name: "추천 장소 8곳" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "촬영 장소 둘러보기" })).toBeVisible();

  await page.getByLabel("검색어", { exact: true }).fill("산책");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page.getByRole("heading", { name: "추천 장소 1곳" })).toBeVisible();

  await page.getByRole("button", { name: "사진으로 검색" }).click();
  // Switching back to image mode restores its own 8 results, not text's 1.
  await expect(page.getByRole("heading", { name: "추천 장소 8곳" })).toBeVisible();
  await expect(page.locator("main article")).toHaveCount(8);

  await page.getByRole("button", { name: "텍스트로 검색" }).click();
  // Switching back to text mode restores its own 1 result, not image's 8.
  await expect(page.getByRole("heading", { name: "추천 장소 1곳" })).toBeVisible();
  await expect(page.locator("main article")).toHaveCount(1);

  expect(errors).toEqual([]);
});

test("텍스트 모드에서 지역 조건을 바꾸면 이전 결과가 즉시 사라진다(stale 표시 없음)", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("/search");
  await switchToTextMode(page);

  await page.getByLabel("검색어", { exact: true }).fill("산책");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page.getByRole("heading", { name: "추천 장소 1곳" })).toBeVisible();

  await page.getByLabel("지역").selectOption("busan_haeundae_gu");
  await expect(page.getByRole("heading", { name: "추천 장소 1곳" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "촬영 장소 둘러보기" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("확인할 수 없는 조건은 결과가 그 조건을 만족한다고 말하지 않고 별도로 안내한다", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("/search");
  await switchToTextMode(page);

  await page.getByLabel("검색어", { exact: true }).fill("조용한 산책");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page.getByRole("heading", { name: "추천 장소 1곳" })).toBeVisible();
  await expect(page.getByText(/확인할 수 있는 정보가 없어/)).toContainText("조용한");

  expect(errors).toEqual([]);
});

test("부산 외 지역 요청은 빈 결과와 안내 문구를 보여준다", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("/search");
  await switchToTextMode(page);

  await page.getByLabel("검색어", { exact: true }).fill("서울 카페");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page.getByRole("heading", { name: "추천 장소 0곳" })).toBeVisible();
  await expect(page.getByText(/부산 지역만 검색할 수 있습니다/)).toBeVisible();

  expect(errors).toEqual([]);
});

test("없는 장소를 검색하면 빈 상태를 안내한다", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("/search");
  await switchToTextMode(page);

  await page.getByLabel("검색어", { exact: true }).fill("존재하지않는가상의장소이름이다");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page.getByRole("heading", { name: "추천 장소 0곳" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "조건에 맞는 장소가 없습니다" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("검색 서버 오류를 안내하고 재시도하면 복구한다", async ({ page }) => {
  const errors = collectPageErrors(page);
  let shouldFail = true;
  await page.route("**/api/search/text", async (route) => {
    if (shouldFail) {
      shouldFail = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "DATA_UNAVAILABLE", message: "test-only failure" }, requestId: "e2e-text" }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/search");
  await switchToTextMode(page);
  await page.getByLabel("검색어", { exact: true }).fill("산책");
  await page.getByRole("button", { name: "검색", exact: true }).click();

  const alert = page.getByRole("alert").filter({ hasText: "장소 데이터를 불러올 수 없습니다" });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole("button", { name: "다시 시도" })).toBeVisible();
  await alert.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByRole("heading", { name: "추천 장소 1곳" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("빈 검색어는 요청을 보내지 않고 바로 안내한다", async ({ page }) => {
  const errors = collectPageErrors(page);
  let requested = false;
  await page.route("**/api/search/text", async (route) => { requested = true; await route.continue(); });

  await page.goto("/search");
  await switchToTextMode(page);
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "검색어를 입력해 주세요" })).toBeVisible();
  expect(requested).toBe(false);

  expect(errors).toEqual([]);
});

test("텍스트 모드로 바로 들어가면 이미지 분석 도구와 이미지 검색 요청이 전혀 발생하지 않는다", async ({ page }) => {
  const errors = collectPageErrors(page);
  const imageSearchCalls: string[] = [];
  await page.route("**/api/search", async (route) => { imageSearchCalls.push(route.request().url()); await route.continue(); });

  await page.goto("/search");
  await switchToTextMode(page);
  // Never touched the image upload UI at all -- the CLIP progress status
  // region (rendered only while embeddingService is active) must never appear.
  await expect(page.getByRole("status").filter({ hasText: "이미지 분석 준비 중" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "참고 이미지 업로드" })).toHaveCount(0);

  await page.getByLabel("검색어", { exact: true }).fill("산책");
  await page.getByRole("button", { name: "검색", exact: true }).click();
  await expect(page.getByRole("heading", { name: "추천 장소 1곳" })).toBeVisible();

  expect(imageSearchCalls).toEqual([]);
  expect(errors).toEqual([]);
});

test("모바일 화면에서도 텍스트 검색 흐름이 넘침 없이 동작한다", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/search");
  await switchToTextMode(page);

  await page.getByLabel("검색어", { exact: true }).fill("산책");
  await page.getByLabel("검색어", { exact: true }).press("Enter");
  await expect(page.getByRole("heading", { name: "추천 장소 1곳" })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1))
    .toBe(true);

  expect(errors).toEqual([]);
});
