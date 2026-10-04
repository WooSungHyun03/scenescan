import { expect, test } from "@playwright/test";
import {
  chooseEvaluationImage,
  collectPageErrors,
  dropEvaluationImage,
  evaluationImagePath,
} from "./helpers";

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
  await page.getByLabel("지역").selectOption("제주");
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
