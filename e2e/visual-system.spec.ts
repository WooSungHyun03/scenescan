import { expect, test, type Page } from "@playwright/test";
import { collectPageErrors } from "./helpers";

const viewports = [
  { width: 320, height: 760 },
  { width: 390, height: 844 },
  { width: 768, height: 900 },
  { width: 1440, height: 900 },
] as const;

async function expectNoDocumentOverflow(page: Page) {
  await expect.poll(() => page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }))).toEqual(expect.objectContaining({
    clientWidth: await page.evaluate(() => document.documentElement.clientWidth),
    scrollWidth: await page.evaluate(() => document.documentElement.clientWidth),
  }));
}

async function expectTouchTargets(page: Page) {
  const undersized = await page.locator([
    "button:not([hidden])",
    "select:not([hidden])",
    "summary:not([hidden])",
    ".scene-nav-link",
    ".scene-section-nav a",
  ].join(",")).evaluateAll((elements) => elements.flatMap((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    if (element.getAttribute("aria-label") === "Open Next.js Dev Tools") return [];
    if (style.display === "none" || style.visibility === "hidden" || rect.width === 0 || rect.height === 0) return [];
    return rect.width + .5 < 44 || rect.height + .5 < 44
      ? [{ label: element.getAttribute("aria-label") ?? element.textContent?.trim(), width: rect.width, height: rect.height }]
      : [];
  }));
  expect(undersized).toEqual([]);
}

async function fillSolarDateTime(page: Page, date: string, time: string) {
  const dateInput = page.getByLabel("촬영 날짜", { exact: true });
  const timeInput = page.getByLabel("촬영 시간", { exact: true });

  await page.waitForLoadState("networkidle");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await dateInput.fill(date);
    await dateInput.blur();
    await timeInput.fill(time);
    await timeInput.blur();
    await page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
    if ((await dateInput.inputValue()) === date && (await timeInput.inputValue()) === time) return;
  }

  await expect(dateInput).toHaveValue(date);
  await expect(timeInput).toHaveValue(time);
}

for (const viewport of viewports) {
  test(`${viewport.width}px 홈과 검색 화면이 넘침 없이 반응한다`, async ({ page }) => {
    const pageErrors = collectPageErrors(page);
    await page.setViewportSize(viewport);

    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoDocumentOverflow(page);
    await expectTouchTargets(page);

    await page.goto("/search");
    await expect(page.getByRole("heading", { level: 1, name: "부산 촬영 장소 찾기" })).toBeVisible();
    await expectNoDocumentOverflow(page);
    await expectTouchTargets(page);
    expect(pageErrors).toEqual([]);
  });
}

test("키보드 건너뛰기와 상세 section navigation이 동작한다", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto("/");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "본문으로 건너뛰기" });
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  await page.goto("/locations/00000000-0000-4000-8000-000000000001");
  const sectionNavigation = page.getByRole("navigation", { name: "장소 상세 바로가기" });
  await expect(sectionNavigation).toBeVisible();
  await expect(sectionNavigation.getByRole("link")).toHaveCount(5);
  await expectNoDocumentOverflow(page);
  await expectTouchTargets(page);

  await sectionNavigation.getByRole("link", { name: "빛의 방향" }).focus();
  await expect(sectionNavigation.getByRole("link", { name: "빛의 방향" })).toBeFocused();
});

test("390px 상세 화면에서 촬영지 시간대와 카메라 방향 UI가 넘치지 않는다", async ({ page }) => {
  const pageErrors = collectPageErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/locations/00000000-0000-4000-8000-000000000001");

  await fillSolarDateTime(page, "2026-06-21", "12:00");
  await expect(page.getByText(/촬영지 시간대:/)).toContainText("Asia/Seoul (UTC+09:00)");
  await page.getByRole("button", { name: "서", exact: true }).click();
  await expect(page.locator("output")).toHaveText("서 · 270°");
  await expect(page.getByRole("status").filter({ hasText: "조명 방향" })).toContainText(
    /순광|측광|역광/,
  );
  await expectNoDocumentOverflow(page);
  expect(pageErrors).toEqual([]);
});

test("브라우저 시간대가 달라도 같은 한국 촬영 시각은 같은 태양 결과를 낸다", async ({ browser }, testInfo) => {
  const baseURL = String(testInfo.project.use.baseURL);
  const results: string[] = [];

  for (const timezoneId of ["UTC", "America/New_York", "Asia/Seoul"]) {
    const context = await browser.newContext({ locale: "ko-KR", timezoneId });
    const page = await context.newPage();
    await page.goto(`${baseURL}/locations/00000000-0000-4000-8000-000000000001`);
    await fillSolarDateTime(page, "2026-06-21", "12:00");
    const compass = page.getByRole("img", { name: /태양 방위각/ }).first();
    await expect(compass).toBeVisible();
    results.push((await compass.getAttribute("aria-label")) ?? "");
    await context.close();
  }

  expect(new Set(results).size).toBe(1);
  expect(results[0]).toContain("태양 방위각");
});

test("reduced motion에서는 카드와 skeleton 움직임을 최소화한다", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const cardTransitionSeconds = await page.locator(".scene-card").first().evaluate((element) => {
    const value = getComputedStyle(element).transitionDuration;
    return value.endsWith("ms") ? Number.parseFloat(value) / 1000 : Number.parseFloat(value);
  },
  );
  expect(cardTransitionSeconds).toBeLessThanOrEqual(.00001);

  await page.goto("/search");
  const motionPreference = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  expect(motionPreference).toBe(true);
});
