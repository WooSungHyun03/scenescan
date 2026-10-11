import { expect, test, type Page, type Route } from "@playwright/test";
import { collectPageErrors } from "./helpers";

const FIRST_ID = "00000000-0000-4000-8000-000000000001";
const SECOND_ID = "00000000-0000-4000-8000-000000000002";
const SHARED_POINT = { latitude: 35.159, longitude: 129.105 };
const SHARED_GRID = { x: 98, y: 75 };

async function seedShortlist(page: Page) {
  await page.addInitScript(({ ids }) => {
    window.localStorage.setItem("scenescan.shortlist.location-ids.v1", JSON.stringify(ids));
  }, { ids: [FIRST_ID, SECOND_ID] });
}

async function forceSharedComparisonGrid(page: Page) {
  await page.route(/\/api\/locations\?/, async (route) => {
    const response = await route.fetch();
    const body = await response.json() as { locations: Array<{ point: typeof SHARED_POINT }> };
    body.locations = body.locations.map((location) => ({ ...location, point: SHARED_POINT }));
    await route.fulfill({ response, json: body });
  });
}

function weatherBody(locationId: string, selected: boolean) {
  return {
    weather: {
      locationId,
      purpose: selected ? "short-forecast" : "observation",
      grid: SHARED_GRID,
      issuedAt: "2026-10-11T02:00:00.000Z",
      observedAt: selected ? null : "2026-10-11T03:00:00.000Z",
      forecastAt: selected ? "2026-10-12T03:00:00.000Z" : null,
      temperatureCelsius: selected ? 19 : 21,
      skyCondition: selected ? "cloudy" : "clear",
      precipitationProbabilityPercent: selected ? 40 : null,
      windSpeedMetersPerSecond: 2.1,
      humidityPercent: 62,
      source: {
        name: "기상청",
        dataset: "기상청 단기예보 조회서비스",
        sourceUrl: "https://www.data.go.kr/data/15084084/openapi.do",
        license: "제3자 권리 포함 : 저작권 표시, 공공저작물 : 출처표시 (제 1유형)",
      },
    },
  };
}

function locationIdFromRoute(route: Route): string {
  return new URL(route.request().url()).pathname.split("/")[3];
}

test("비교 외부 정보는 같은 기상 격자를 공유하고 펼친 후보만 조회한다", async ({ page }) => {
  const pageErrors = collectPageErrors(page);
  await seedShortlist(page);
  await forceSharedComparisonGrid(page);

  let currentWeatherCalls = 0;
  let selectedWeatherCalls = 0;
  let parkingCalls = 0;
  let contactCalls = 0;
  let notifyCurrentStarted!: () => void;
  const currentStarted = new Promise<void>((resolve) => { notifyCurrentStarted = resolve; });

  await page.route("**/api/locations/*/weather*", async (route) => {
    const url = new URL(route.request().url());
    const selected = url.searchParams.has("at");
    if (selected) selectedWeatherCalls += 1;
    else {
      currentWeatherCalls += 1;
      notifyCurrentStarted();
      await new Promise((resolve) => setTimeout(resolve, 900));
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(weatherBody(locationIdFromRoute(route), selected)) });
  });
  await page.route("**/api/locations/*/parking?*", async (route) => {
    parkingCalls += 1;
    const locationId = locationIdFromRoute(route);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        locationId,
        radiusMeters: 1000,
        sourceMode: "fixture",
        candidates: [{
          id: `fixture:${parkingCalls}`,
          providerPlaceId: String(parkingCalls),
          relationship: "nearby",
          name: `비교 주차장 ${parkingCalls}`,
          address: "부산 테스트 주소",
          phone: "051-000-0001",
          placeUrl: `https://place.map.kakao.com/${parkingCalls}`,
          point: SHARED_POINT,
          distanceMeters: 240,
          capacity: null,
          openingHours: null,
          priceInfo: null,
          source: "SceneScan synthetic fixture",
        }],
      }),
    });
  });
  await page.route("**/api/locations/*/contacts", async (route) => {
    contactCalls += 1;
    const locationId = locationIdFromRoute(route);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        locationId,
        contacts: [{
          id: `fixture-contact:${contactCalls}`,
          contactType: "place_contact",
          contactName: "장소 대표번호",
          phone: "051-000-0101",
          source: "Kakao Local",
          sourceUrl: `https://place.map.kakao.com/${contactCalls}`,
          lastVerifiedAt: "2026-10-11T00:00:00+09:00",
          verification: "provider_suggestion",
          providerPlaceId: String(contactCalls),
          distanceMeters: 12,
          matchBasis: ["name", "coordinate"],
        }],
        resolution: "provider_suggestion",
        reviewRequired: true,
        reason: "provider_contact_suggested",
        sourceMode: "fixture",
      }),
    });
  });

  await page.goto("/shortlist");
  await expect(page.getByRole("heading", { name: "후보 장소 비교" })).toBeVisible();
  await currentStarted;
  expect(currentWeatherCalls).toBe(1);

  await page.getByLabel("촬영 날짜", { exact: true }).fill("2026-10-12");
  await page.getByLabel("촬영 시간", { exact: true }).fill("12:00");
  await expect(page.getByText("선택 시각 예보 · 단기예보")).toHaveCount(2);
  await page.waitForTimeout(1_000);
  await expect(page.getByText("선택 시각 예보 · 단기예보")).toHaveCount(2);
  expect(selectedWeatherCalls).toBe(1);
  expect(parkingCalls).toBe(0);
  expect(contactCalls).toBe(0);

  const expandButtons = page.getByRole("button", { name: "외부 정보 펼치기" });
  await expandButtons.nth(0).click();
  await expect(page.getByText("비교 주차장 1")).toBeVisible();
  await expect(page.getByRole("heading", { name: "장소 대표 연락처" })).toBeVisible();
  expect(parkingCalls).toBe(1);
  expect(contactCalls).toBe(1);

  await page.getByRole("button", { name: "외부 정보 접기" }).click();
  await page.getByRole("button", { name: "외부 정보 펼치기" }).nth(0).click();
  await expect(page.getByText("비교 주차장 1")).toBeVisible();
  expect(parkingCalls).toBe(1);
  expect(contactCalls).toBe(1);

  await page.getByRole("button", { name: "외부 정보 펼치기" }).click();
  await expect(page.getByText("비교 주차장 2")).toBeVisible();
  expect(parkingCalls).toBe(2);
  expect(contactCalls).toBe(2);

  await page.setViewportSize({ width: 390, height: 844 });
  const comparison = page.getByRole("region", { name: "후보 장소 비교표, 가로로 스크롤 가능" });
  await expect(comparison).toBeVisible();
  await comparison.getByRole("link", { name: /청록 창고/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "청록 창고" })).toBeVisible();
  await expect(page.getByRole("region", { name: "청록 창고 위치 지도" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "비슷한 장소도 살펴보세요" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "장소 대표 연락처" })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("외부 서비스 offline 실패가 비교와 상세의 기존 흐름을 막지 않는다", async ({ page }) => {
  const pageErrors = collectPageErrors(page);
  await seedShortlist(page);
  await page.route("**/api/locations/*/weather*", (route) => route.abort("internetdisconnected"));
  await page.route("**/api/locations/*/parking?*", (route) => route.abort("internetdisconnected"));
  await page.route("**/api/locations/*/contacts", (route) => route.abort("internetdisconnected"));

  await page.goto("/shortlist");
  await expect(page.getByRole("heading", { name: "후보 장소 비교" })).toBeVisible();
  await page.getByRole("button", { name: "외부 정보 펼치기" }).nth(0).click();
  await expect(page.getByText(/주변 주차장을 불러오지 못했습니다/)).toBeVisible();
  await expect(page.getByText(/연락처를 불러오지 못했습니다/)).toBeVisible();
  await expect(page.getByText("청록 창고", { exact: true }).first()).toBeVisible();

  const comparison = page.getByRole("region", { name: "후보 장소 비교표, 가로로 스크롤 가능" });
  await comparison.getByRole("link", { name: /청록 창고/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "청록 창고" })).toBeVisible();
  await expect(page.getByRole("region", { name: "청록 창고 위치 지도" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "비슷한 장소도 살펴보세요" })).toBeVisible();
  await expect(page.getByText("날짜와 시간을 모두 선택하면 태양 위치를 계산합니다.")).toBeVisible();
  expect(pageErrors).toEqual([]);
});
