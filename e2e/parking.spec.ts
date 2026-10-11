import { expect, test } from "@playwright/test";
import { collectPageErrors } from "./helpers";

const locationId = "00000000-0000-4000-8000-000000000003";

function candidate(id: string, rank: number) {
  return {
    id: `fixture:${id}`,
    providerPlaceId: id,
    relationship: "nearby",
    name: `합성 주변 주차장 ${rank}`,
    address: `합성 도로명 ${rank}`,
    phone: rank === 1 ? "051-000-0001" : null,
    placeUrl: `https://place.map.kakao.com/${id}`,
    point: { latitude: 35.159 + rank * 0.001, longitude: 129.105 },
    distanceMeters: rank * 111,
    capacity: null,
    openingHours: null,
    priceInfo: null,
    source: "SceneScan synthetic fixture",
  } as const;
}

test("반경 확대와 목록·지도 선택이 연결되고 모바일에서 넘치지 않는다", async ({ page }) => {
  const errors = collectPageErrors(page);
  const requestedRadii: string[] = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/locations/*/parking**", (route) => {
    const radius = new URL(route.request().url()).searchParams.get("radius") ?? "1000";
    requestedRadii.push(radius);
    const count = radius === "1000" ? 2 : 3;
    return route.fulfill({
      json: {
        locationId,
        radiusMeters: Number(radius),
        candidates: Array.from({ length: count }, (_, index) => candidate(String(800 + index), index + 1)),
        sourceMode: "fixture",
      },
    });
  });

  await page.goto(`/locations/${locationId}`);
  const parking = page.getByRole("region", { name: "주차 정보" });
  await expect(parking.getByText("합성 주변 주차장 1", { exact: true })).toBeVisible();
  await expect(parking.getByText("합성 주변 주차장 2", { exact: true })).toBeVisible();
  await expect(parking.getByText("실시간 빈자리", { exact: false })).toBeVisible();
  await expect(parking.getByRole("link", { name: "051-000-0001" })).toHaveAttribute("href", "tel:0510000001");
  await expect(parking.getByRole("link", { name: "카카오맵에서 보기" }).first())
    .toHaveAttribute("href", "https://place.map.kakao.com/800");

  const secondListButton = parking.getByRole("button", { name: "지도에서 합성 주변 주차장 2 선택" });
  await secondListButton.click();
  await expect(secondListButton).toHaveAttribute("aria-pressed", "true");
  const secondMarker = page.getByRole("button", { name: "2위 합성 주변 주차장 2 위치" });
  await expect(secondMarker).toHaveAttribute("aria-pressed", "true");

  const firstMarker = page.getByRole("button", { name: "1위 합성 주변 주차장 1 위치" });
  await firstMarker.click();
  await expect(parking.getByRole("button", { name: "지도에서 합성 주변 주차장 1 선택" }))
    .toHaveAttribute("aria-pressed", "true");

  await parking.getByRole("button", { name: "3km" }).click();
  await expect(parking.getByText("합성 주변 주차장 3", { exact: true })).toBeVisible();
  expect(requestedRadii.at(-1)).toBe("3000");
  expect(requestedRadii).toContain("1000");
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  )).toBe(true);
  expect(errors).toEqual([]);
});

test("빈 결과와 provider 실패는 정적 상세와 지도를 막지 않는다", async ({ page }) => {
  let wideRequestCount = 0;
  await page.route("**/api/locations/*/parking**", (route) => {
    const radius = new URL(route.request().url()).searchParams.get("radius");
    if (radius === "1000") {
      return route.fulfill({ json: {
        locationId,
        radiusMeters: 1_000,
        candidates: [],
        sourceMode: "fixture",
      } });
    }
    wideRequestCount += 1;
    if (wideRequestCount === 1) {
      return route.fulfill({ status: 503, json: { error: { code: "DATA_UNAVAILABLE" } } });
    }
    return route.fulfill({ json: {
      locationId,
      radiusMeters: 3_000,
      candidates: [candidate("900", 1)],
      sourceMode: "fixture",
    } });
  });

  await page.goto(`/locations/${locationId}`);
  const parking = page.getByRole("region", { name: "주차 정보" });
  await expect(parking.getByText("선택한 반경 안에서 제공된 주차장 후보가 없습니다.")).toBeVisible();
  await parking.getByRole("button", { name: "3km" }).click();
  await expect(parking.getByRole("alert")).toContainText("주변 주차장을 불러오지 못했습니다");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("region", { name: /위치 지도/ })).toBeVisible();
  await parking.getByRole("button", { name: "다시 확인" }).click();
  await expect(parking.getByText("합성 주변 주차장 1", { exact: true })).toBeVisible();
});
