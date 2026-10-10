import { expect, test } from "@playwright/test";
import { collectPageErrors } from "./helpers";

const locationId = "00000000-0000-4000-8000-000000000003";
// Explicit synthetic HTTP fixture: never used as production weather.
const observation = {
  locationId, purpose: "observation", grid: { x: 98, y: 76 },
  issuedAt: "2026-10-11T12:00:00+09:00", observedAt: "2026-10-11T12:00:00+09:00", forecastAt: null,
  temperatureCelsius: 0, skyCondition: null, precipitationProbabilityPercent: null,
  windSpeedMetersPerSecond: 0, humidityPercent: null,
  source: { name: "기상청", dataset: "기상청 단기예보 조회서비스", sourceUrl: "https://www.data.go.kr/data/15084084/openapi.do",
    license: "제3자 권리 포함 : 저작권 표시, 공공저작물 : 출처표시 (제 1유형)" },
};

test("날씨는 명시적으로 조회하고 선택한 한국 시각을 UTC로 전달하며 stale 결과를 숨긴다", async ({ page }) => {
  const errors = collectPageErrors(page);
  const times: (string | null)[] = [];
  await page.route("**/api/locations/*/weather**", (route) => {
    const at = new URL(route.request().url()).searchParams.get("at");
    times.push(at);
    return route.fulfill({ json: { weather: at ? { ...observation, purpose: "short-forecast", observedAt: null, forecastAt: at } : observation } });
  });
  await page.goto(`/locations/${locationId}`);
  const panel = page.getByRole("region", { name: "날씨", exact: true });
  expect(times).toEqual([]);
  await panel.getByRole("button", { name: "현재 날씨 확인" }).click();
  await expect(panel.getByText(/^관측 ·/)).toBeVisible();
  await expect(panel.getByText("0℃", { exact: true })).toBeVisible();
  await expect(panel.getByText("정보 없음", { exact: true })).toHaveCount(3);
  await page.getByLabel("촬영 날짜", { exact: true }).fill("2026-10-12");
  await expect(panel.getByText(/^관측 ·/)).toHaveCount(0);
  await expect(panel.getByRole("button")).toBeDisabled();
  await page.getByLabel("촬영 시간", { exact: true }).fill("12:30");
  await panel.getByRole("button", { name: "이 시각 날씨 확인" }).click();
  await expect(panel.getByText(/^예보 ·/)).toBeVisible();
  expect(times).toEqual([null, "2026-10-12T03:30:00.000Z"]);
  await page.getByLabel("촬영 시간", { exact: true }).fill("13:30");
  await expect(panel.getByText(/^예보 ·/)).toHaveCount(0);
  expect(times).toHaveLength(2);
  expect(errors).toEqual([]);
});

test("날씨 provider 실패와 재시도는 태양 계산을 막지 않는다", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/locations/*/weather**", (route) => {
    attempts++;
    return attempts === 1 ? route.fulfill({ status: 503, json: { error: { code: "DATA_UNAVAILABLE" } } })
      : route.fulfill({ json: { weather: observation } });
  });
  await page.goto(`/locations/${locationId}`);
  const panel = page.getByRole("region", { name: "날씨", exact: true });
  await panel.getByRole("button", { name: "현재 날씨 확인" }).click();
  await expect(panel.getByRole("alert")).toContainText("날씨 정보를 불러올 수 없습니다");
  await panel.getByRole("button", { name: "날씨 다시 확인" }).click();
  await expect(panel.getByText(/^관측 ·/)).toBeVisible();
  await page.getByLabel("촬영 날짜", { exact: true }).fill("2026-10-12");
  await page.getByLabel("촬영 시간", { exact: true }).fill("12:30");
  await expect(page.getByText("태양이 지평선 위에 있습니다")).toBeVisible();
});

test("다른 장소 또는 malformed 날씨 응답을 실제 관측처럼 표시하지 않는다", async ({ page }) => {
  await page.route("**/api/locations/*/weather**", (route) => route.fulfill({ json: {
    weather: { ...observation, locationId: "00000000-0000-4000-8000-000000000001" },
  } }));
  await page.goto(`/locations/${locationId}`);
  const panel = page.getByRole("region", { name: "날씨", exact: true });
  await panel.getByRole("button", { name: "현재 날씨 확인" }).click();
  await expect(panel.getByRole("alert")).toContainText("날씨 응답을 확인할 수 없습니다");
  await expect(panel.getByText("0℃", { exact: true })).toHaveCount(0);
});
