import { expect, test } from "@playwright/test";
import {
  chooseEvaluationImage,
  collectPageErrors,
  dropEvaluationImage,
  evaluationImagePath,
} from "./helpers";

for (const mode of ["image", "text"] as const) {
  test(`${mode} 검색 취소 후 늦은 응답을 무시하고 다시 검색할 수 있다`, async ({ page }) => {
    const errors = collectPageErrors(page);
    const endpoint = mode === "image" ? "**/api/search" : "**/api/search/text";
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    await page.route(endpoint, async (route) => {
      calls++;
      if (calls === 1) {
        await held;
        await route.fulfill({ json: { results: [] } }).catch(() => undefined);
      } else await route.continue();
    });
    await page.goto("/search");
    if (mode === "image") await chooseEvaluationImage(page);
    else {
      await page.getByRole("button", { name: "텍스트로 검색", exact: true }).click();
      await page.getByLabel("검색어", { exact: true }).fill("해운대");
    }
    const submit = page.getByRole("button", { name: mode === "image" ? "이 이미지로 장소 찾기" : "검색", exact: true });
    await submit.click();
    await expect.poll(() => calls).toBe(1);
    await page.getByRole("button", { name: "검색 취소", exact: true }).click();
    await expect(page.getByText("검색을 취소했습니다. 조건을 변경하거나 다시 검색할 수 있습니다.")).toBeVisible();
    release();
    await expect(page.getByRole("heading", { name: "추천 장소 0곳" })).toHaveCount(0);
    await expect(submit).toBeEnabled();
    await submit.click();
    await expect.poll(() => calls).toBe(2);
    await expect(page.getByRole("heading", { name: /^추천 장소 \d+곳$/ })).toBeVisible();
    await expect(page.getByText("검색을 취소했습니다. 조건을 변경하거나 다시 검색할 수 있습니다.")).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test("초기 스크립트가 늦어도 업로드는 준비된 뒤 활성화된다", async ({ page }) => {
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>((resolve) => { releaseScripts = resolve; });
  await page.route("**/_next/static/**", async (route) => {
    if (route.request().resourceType() === "script") await scriptsReady;
    await route.continue();
  });
  try {
    await page.goto("/search", { waitUntil: "commit" });
    const upload = page.getByRole("button", { name: "참고 이미지 업로드" });
    await expect(upload).toBeVisible();
    await expect(upload).toBeDisabled();
    await expect(page.getByLabel("참고 이미지 파일 선택")).toBeDisabled();
    releaseScripts();
    await expect(upload).toBeEnabled();
    await chooseEvaluationImage(page);
  } finally {
    releaseScripts();
  }
});

test("drag and drop 미리보기와 삭제가 동작한다", async ({ page }) => {
  const pageErrors = collectPageErrors(page);
  await page.goto("/search");

  await dropEvaluationImage(page);
  await expect(page.getByText("demo-01-query.png", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "선택한 이미지 삭제" }).click();
  await expect(page.getByRole("button", { name: "참고 이미지 업로드" })).toBeVisible();
  await expect(page.getByAltText("선택한 참고 이미지")).toHaveCount(0);

  expect(pageErrors).toEqual([]);
});

test("잘못된 이미지와 빈 검색 결과를 구분해서 안내한다", async ({ page }) => {
  const pageErrors = collectPageErrors(page);
  await page.goto("/search");

  await expect(page.getByLabel("참고 이미지 파일 선택")).toBeEnabled();
  await page.getByLabel("참고 이미지 파일 선택").setInputFiles({
    name: "empty.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(0),
  });
  const invalidImageAlert = page.getByRole("alert").filter({
    hasText: "사진을 선택할 수 없습니다",
  });
  await expect(invalidImageAlert).toContainText("사진을 선택할 수 없습니다");
  await expect(invalidImageAlert).toContainText("빈 파일입니다");

  await page.getByLabel("참고 이미지 파일 선택").setInputFiles(evaluationImagePath);
  await expect(page.getByAltText("선택한 참고 이미지")).toBeVisible();
  await page.getByLabel("지역").selectOption("busan_jung_gu");
  await page.getByRole("button", { name: "이 이미지로 장소 찾기" }).click();

  await expect(page.getByRole("heading", { name: "추천 장소 0곳" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "조건에 맞는 장소가 없습니다" })).toBeVisible();
  await expect(page.getByText("촬영 후보 0곳을 찾았습니다.")).toBeVisible();
  await page.getByRole("button", { name: "검색 조건 초기화" }).click();
  await expect(page.getByLabel("지역")).toHaveValue("");

  expect(pageErrors).toEqual([]);
});

test("DB 오류를 표시하고 재시도하면 결과를 복구한다", async ({ page }) => {
  const pageErrors = collectPageErrors(page);
  let shouldFail = true;
  await page.route("**/api/search", async (route) => {
    if (shouldFail) {
      shouldFail = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "DATA_UNAVAILABLE", message: "test-only failure" },
          requestId: "e2e-request",
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.goto("/search");
  await chooseEvaluationImage(page);
  await page.getByRole("button", { name: "이 이미지로 장소 찾기" }).click();
  const alert = page.getByRole("alert").filter({
    hasText: "장소 데이터를 불러올 수 없습니다",
  });
  await expect(alert).toContainText("장소 데이터를 불러올 수 없습니다");
  await expect(alert.getByRole("button", { name: "다시 시도" })).toBeVisible();

  await alert.getByRole("button", { name: "다시 시도" }).click();
  await expect(page.getByRole("heading", { name: "추천 장소 8곳" })).toBeVisible();
  await expect(page.locator("main article")).toHaveCount(8);

  expect(pageErrors).toEqual([]);
});

test("모바일에서도 업로드와 Top 8 흐름이 넘침 없이 동작한다", async ({ page }) => {
  const pageErrors = collectPageErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/search");

  await chooseEvaluationImage(page);
  await page.getByRole("button", { name: "이 이미지로 장소 찾기" }).click();
  await expect(page.getByRole("heading", { name: "추천 장소 8곳" })).toBeVisible();
  await expect(page.getByText("참고 이미지와 비교하세요")).toBeVisible();
  await expect(page.locator("main article")).toHaveCount(8);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);

  expect(pageErrors).toEqual([]);
});
