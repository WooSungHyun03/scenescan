import { expect, test } from "@playwright/test";
import { collectPageErrors, evaluationImagePath } from "./helpers";

test("업로드부터 Top 8, 지도, 상세, 태양 정보와 shortlist 비교까지 이어진다", async ({
  page,
}) => {
  const pageErrors = collectPageErrors(page);

  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: /원하는 장면을 올리면, 비슷한 장소를 찾아드려요/,
    }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "예시 장소 둘러보기" })).toBeVisible();

  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "참고 이미지 선택" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(evaluationImagePath);

  await expect(page).toHaveURL(/\/search$/);
  await expect(page.getByAltText("선택한 참고 이미지")).toBeVisible();
  await expect(page.getByText("demo-01-query.png", { exact: true })).toBeVisible();

  await page.getByLabel("지역").selectOption("서울");
  await page.getByLabel("공간 종류").selectOption("nature");
  await expect(page.getByText(/서울 · 자연에 등록된 장소 1곳/)).toBeVisible();
  await page.getByRole("button", { name: "초기화" }).click();
  await expect(page.getByLabel("지역")).toHaveValue("");
  await expect(page.getByLabel("공간 종류")).toHaveValue("");

  const searchResponse = page.waitForResponse(
    (response) => response.url().endsWith("/api/search") && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "이 이미지로 장소 찾기" }).click();
  expect((await searchResponse).status()).toBe(200);

  await expect(page.getByRole("heading", { name: "추천 장소 8곳" })).toBeVisible();
  await expect(page.getByText("촬영 후보 8곳을 찾았습니다.")).toBeVisible();
  const resultCards = page.locator("main article");
  await expect(resultCards).toHaveCount(8);

  const firstName = (await resultCards.nth(0).getByRole("heading", { level: 3 }).innerText()).trim();
  const secondName = (await resultCards.nth(1).getByRole("heading", { level: 3 }).innerText()).trim();
  await resultCards
    .nth(0)
    .getByRole("button", { name: `${firstName} 관심 장소에 저장` })
    .click();
  await resultCards
    .nth(1)
    .getByRole("button", { name: `${secondName} 관심 장소에 저장` })
    .click();

  await page.getByRole("button", { name: "지도", exact: true }).click();
  const resultsMap = page.getByRole("region", { name: "검색 결과 장소 분포 지도" });
  await expect(resultsMap).toBeVisible();
  await expect(resultsMap).toHaveAttribute("data-map-mode", "mock");
  await expect(page.getByRole("list", { name: "지도 마커 키보드 선택" }).getByRole("button")).toHaveCount(8);
  await page.getByRole("button", { name: `1. ${firstName}` }).focus();
  await expect(page.getByText(new RegExp(`^${firstName} ·`))).toBeVisible();

  await page.getByRole("button", { name: "사진", exact: true }).click();
  await page.getByRole("link", { name: firstName, exact: true }).click();
  await expect(page).toHaveURL(/\/locations\//);
  await expect(page.getByRole("heading", { level: 1, name: firstName })).toBeVisible();
  await expect(
    page.getByRole("button", { name: `${firstName} 관심 장소에서 제거` }),
  ).toBeVisible();

  const detailMap = page.getByRole("region", { name: `${firstName} 위치 지도` });
  await expect(detailMap).toBeVisible();
  await expect(detailMap).toHaveAttribute("data-map-mode", "mock");
  await expect(detailMap).toContainText("Kakao Map을 사용할 수 없어 지도 미리보기를 표시합니다.");

  await page.getByLabel("촬영 날짜", { exact: true }).fill("2026-06-21");
  await page.getByLabel("촬영 시간", { exact: true }).fill("12:00");
  await expect(page.getByText(/태양이 지평선 (위|아래)에 있습니다/)).toBeVisible();
  await page.getByRole("button", { name: "동", exact: true }).click();
  await expect(page.locator("output")).toHaveText("동 · 90°");
  await expect(page.getByRole("status").filter({ hasText: "조명 방향" })).toContainText(
    /순광|측광|역광|분류 불가/,
  );

  const similar = page.locator("#similar");
  const previousIds = await similar.locator("article a").evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  const nextRequest = page.waitForRequest((request) => request.url().includes("/similar?"));
  await similar.getByRole("button", { name: "다른 비슷한 장소 보기" }).click();
  expect(new URL((await nextRequest).url()).searchParams.getAll("exclude")).toHaveLength(previousIds.length);
  await expect(similar.getByRole("button", { name: "추가 후보 없음" })).toBeDisabled();
  expect(await similar.locator("article a").evaluateAll((links) => links.map((link) => link.getAttribute("href")))).toEqual(previousIds);

  await page.getByRole("link", { name: /^관심 장소/ }).click();
  await expect(page).toHaveURL(/\/shortlist$/);
  await expect(page.getByRole("heading", { level: 1, name: "관심 장소" })).toBeVisible();
  await expect(page.getByText(/촬영 후보 2곳이 저장/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "후보 장소 비교" })).toBeVisible();
  await expect(page.getByText("2 / 4곳 선택")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "후보 장소 비교표, 가로로 스크롤 가능" }),
  ).toBeVisible();

  expect(pageErrors).toEqual([]);
});
