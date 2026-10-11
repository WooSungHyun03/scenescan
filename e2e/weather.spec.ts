import { expect, test } from "@playwright/test";
import { collectPageErrors } from "./helpers";

const locationId = "00000000-0000-4000-8000-000000000003";
// Explicit synthetic HTTP fixture: never used as production weather.
const observation = {
  locationId,
  purpose: "observation",
  grid: { x: 98, y: 76 },
  issuedAt: "2026-10-11T12:00:00+09:00",
  observedAt: "2026-10-11T12:00:00+09:00",
  forecastAt: null,
  temperatureCelsius: 0,
  skyCondition: null,
  precipitationProbabilityPercent: null,
  windSpeedMetersPerSecond: 0,
  humidityPercent: null,
  source: {
    name: "기상청",
    dataset: "기상청 단기예보 조회서비스",
    sourceUrl: "https://www.data.go.kr/data/15084084/openapi.do",
    license: "제3자 권리 포함 : 저작권 표시, 공공저작물 : 출처표시 (제 1유형)",
  },
};

function forecast(at: string) {
  return {
    ...observation,
    purpose: "short-forecast",
    observedAt: null,
    forecastAt: at,
    temperatureCelsius: 21,
    skyCondition: "clear",
    precipitationProbabilityPercent: 10,
    windSpeedMetersPerSecond: 2.4,
    humidityPercent: 55,
  };
}

test("빈 입력은 현재 날씨를, 같은 한국 촬영 시각은 선택 시각 예보를 표시한다", async ({ page }) => {
  const errors = collectPageErrors(page);
  const times: Array<string | null> = [];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/locations/*/weather**", (route) => {
    const at = new URL(route.request().url()).searchParams.get("at");
    times.push(at);
    return route.fulfill({ json: { weather: at ? forecast(at) : observation } });
  });

  await page.goto(`/locations/${locationId}`);
  const panel = page.getByRole("region", { name: "날씨", exact: true });
  await expect(panel.getByText("현재 날씨 · 실황", { exact: true })).toBeVisible();
  await expect(panel.getByText("0℃", { exact: true })).toBeVisible();
  await expect(panel.getByText("미제공", { exact: true })).toHaveCount(3);
  await expect(panel.getByText(/발표 시각/)).toContainText("2026. 10. 11. 오후 12:00");
  expect(times).toEqual([null]);

  await page.getByLabel("촬영 날짜", { exact: true }).fill("2026-10-12");
  await expect(panel.getByText("촬영 날짜와 시간을 모두 올바르게 선택해 주세요.")).toBeVisible();
  await expect(panel.getByText("현재 날씨 · 실황", { exact: true })).toHaveCount(0);
  await page.waitForTimeout(450);
  expect(times).toEqual([null]);

  await page.getByLabel("촬영 시간", { exact: true }).fill("12:30");
  await expect(panel.getByText("선택 시각 예보 · 단기예보", { exact: true })).toBeVisible();
  await expect(panel.getByText(/예보 시각/)).toContainText("2026. 10. 12. 오후 12:30");
  expect(times).toEqual([null, "2026-10-12T03:30:00.000Z"]);
  await expect.poll(() => page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 1,
  )).toBe(true);
  expect(errors).toEqual([]);
});

test("빠른 입력은 debounce하고 취소된 이전 응답을 표시하지 않는다", async ({ page }) => {
  const requested: string[] = [];
  await page.route("**/api/locations/*/weather**", async (route) => {
    const at = new URL(route.request().url()).searchParams.get("at");
    if (!at) {
      await route.fulfill({ json: { weather: observation } });
      return;
    }
    requested.push(at);
    if (at === "2026-10-12T03:30:00.000Z") {
      await new Promise((resolve) => setTimeout(resolve, 1_200));
    }
    await route.fulfill({ json: { weather: forecast(at) } }).catch(() => undefined);
  });

  await page.goto(`/locations/${locationId}`);
  const panel = page.getByRole("region", { name: "날씨", exact: true });
  await expect(panel.getByText("현재 날씨 · 실황", { exact: true })).toBeVisible();
  await page.getByLabel("촬영 날짜", { exact: true }).fill("2026-10-12");
  await page.getByLabel("촬영 시간", { exact: true }).fill("12:30");
  await expect.poll(() => requested).toContain("2026-10-12T03:30:00.000Z");

  await page.getByLabel("촬영 시간", { exact: true }).fill("13:00");
  await page.getByLabel("촬영 시간", { exact: true }).fill("13:15");
  await page.getByLabel("촬영 시간", { exact: true }).fill("13:30");
  await expect(panel.getByText("선택 시각 예보 · 단기예보", { exact: true })).toBeVisible();
  await expect(panel.getByText(/예보 시각/)).toContainText("2026. 10. 12. 오후 1:30");
  expect(requested).toEqual([
    "2026-10-12T03:30:00.000Z",
    "2026-10-12T04:30:00.000Z",
  ]);
  await page.waitForTimeout(1_000);
  await expect(panel.getByText(/예보 시각/)).toContainText("2026. 10. 12. 오후 1:30");
});

test("날씨 실패와 범위 밖 시각은 태양 계산과 상세 화면을 막지 않는다", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/locations/*/weather**", (route) => {
    const at = new URL(route.request().url()).searchParams.get("at");
    attempts += 1;
    if (!at && attempts === 1) {
      return route.fulfill({ status: 503, json: { error: { code: "DATA_UNAVAILABLE" } } });
    }
    if (at) {
      return route.fulfill({ status: 400, json: { error: { code: "VALIDATION_ERROR" } } });
    }
    return route.fulfill({ json: { weather: observation } });
  });

  await page.goto(`/locations/${locationId}`);
  const panel = page.getByRole("region", { name: "날씨", exact: true });
  await expect(panel.getByRole("alert")).toContainText("날씨 정보를 불러올 수 없습니다");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await panel.getByRole("button", { name: "날씨 다시 확인" }).click();
  await expect(panel.getByText("현재 날씨 · 실황", { exact: true })).toBeVisible();

  await page.getByLabel("촬영 날짜", { exact: true }).fill("2035-01-01");
  await page.getByLabel("촬영 시간", { exact: true }).fill("12:30");
  await expect(page.getByText(/태양이 지평선 (위|아래)에 있습니다/)).toBeVisible();
  await expect(panel.getByRole("alert")).toContainText("최근 1시간부터 앞으로 4일 이내");
  await expect(panel.getByText(/현재 날씨|선택 시각 예보/)).toHaveCount(0);
});

test("다른 장소 또는 malformed 날씨 응답을 실제 관측처럼 표시하지 않는다", async ({ page }) => {
  await page.route("**/api/locations/*/weather**", (route) => route.fulfill({
    json: {
      weather: {
        ...observation,
        locationId: "00000000-0000-4000-8000-000000000001",
      },
    },
  }));
  await page.goto(`/locations/${locationId}`);
  const panel = page.getByRole("region", { name: "날씨", exact: true });
  await expect(panel.getByRole("alert")).toContainText("날씨 응답을 확인할 수 없습니다");
  await expect(panel.getByText("0℃", { exact: true })).toHaveCount(0);
});
