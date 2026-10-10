import { describe, expect, it } from "vitest";
import { locationWeatherResponseSchema } from "./weather";

const weather = {
  locationId: "00000000-0000-4000-8000-000000000003",
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
    name: "기상청", dataset: "기상청 단기예보 조회서비스",
    sourceUrl: "https://www.data.go.kr/data/15084084/openapi.do",
    license: "제3자 권리 포함 : 저작권 표시, 공공저작물 : 출처표시 (제 1유형)",
  },
};

describe("weather response boundary", () => {
  it("preserves measured zero and unknown fields", () => {
    expect(locationWeatherResponseSchema.parse({ weather }).weather).toMatchObject({
      temperatureCelsius: 0, humidityPercent: null, precipitationProbabilityPercent: null,
    });
  });
  it.each([NaN, Infinity, "0", ""])("rejects invalid temperature %j", (value) => {
    expect(locationWeatherResponseSchema.safeParse({ weather: { ...weather, temperatureCelsius: value } }).success).toBe(false);
  });
  it("rejects mismatched observation/forecast timestamps and missing offsets", () => {
    for (const fields of [{ purpose: "short-forecast" }, { forecastAt: weather.observedAt }, { issuedAt: "2026-10-11T12:00:00" }]) {
      expect(locationWeatherResponseSchema.safeParse({ weather: { ...weather, ...fields } }).success).toBe(false);
    }
  });
  it("rejects out-of-range measurements and unsafe source URLs", () => {
    for (const fields of [{ humidityPercent: 101 }, { precipitationProbabilityPercent: -1 }, { windSpeedMetersPerSecond: -1 },
      { source: { ...weather.source, sourceUrl: "javascript:alert(1)" } }]) {
      expect(locationWeatherResponseSchema.safeParse({ weather: { ...weather, ...fields } }).success).toBe(false);
    }
  });
});
