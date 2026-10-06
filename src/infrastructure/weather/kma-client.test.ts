import { describe, expect, it, vi } from "vitest";

import observationFixture from "./fixtures/ultra-short-observation.json";
import quotaFixture from "./fixtures/quota-error.json";
import shortFixture from "./fixtures/short-forecast.json";
import ultraFixture from "./fixtures/ultra-short-forecast.json";
import { KmaWeatherClient, KmaWeatherError } from "./kma-client";

const SEOUL = { latitude: 37.5665, longitude: 126.978 };
const LOCATION_ID = "11111111-1111-4111-8111-111111111111";

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function client(fixture: unknown, now: string, overrides: Partial<ConstructorParameters<typeof KmaWeatherClient>[0]> = {}) {
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    void input;
    return jsonResponse(fixture);
  });
  return {
    fetcher,
    client: new KmaWeatherClient({
      serviceKey: "encoded%2Bservice%2Fkey%3D",
      fetcher: fetcher as unknown as typeof fetch,
      now: () => new Date(now),
      ...overrides,
    }),
  };
}

describe("KmaWeatherClient", () => {
  it("maps an official observation response and leaves unavailable categories null", async () => {
    const setup = client(observationFixture, "2026-10-06T05:50:00Z");
    const weather = await setup.client.getWeather({ locationId: LOCATION_ID, point: SEOUL });
    expect(weather).toMatchObject({
      locationId: LOCATION_ID,
      purpose: "observation",
      grid: { x: 60, y: 127 },
      issuedAt: "2026-10-06T14:00:00+09:00",
      observedAt: "2026-10-06T14:00:00+09:00",
      forecastAt: null,
      temperatureCelsius: 21.4,
      humidityPercent: 58,
      windSpeedMetersPerSecond: 2.3,
      skyCondition: null,
      precipitationProbabilityPercent: null,
    });
    const requestedUrl = new URL(String(setup.fetcher.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname.endsWith("/getUltraSrtNcst")).toBe(true);
    expect(requestedUrl.searchParams.get("serviceKey")).toBe("encoded+service/key=");
    expect(requestedUrl.searchParams.get("base_date")).toBe("20261006");
    expect(requestedUrl.searchParams.get("base_time")).toBe("1400");
  });

  it("selects the earliest ultra-short forecast at or after the target", async () => {
    const setup = client(ultraFixture, "2026-10-06T05:50:00Z");
    const weather = await setup.client.getWeather({
      locationId: LOCATION_ID,
      point: SEOUL,
      target: new Date("2026-10-06T06:20:00Z"),
    });
    expect(weather).toMatchObject({
      purpose: "ultra-short-forecast",
      issuedAt: "2026-10-06T14:30:00+09:00",
      forecastAt: "2026-10-06T16:00:00+09:00",
      temperatureCelsius: 23,
      skyCondition: "mostly-cloudy",
      precipitationProbabilityPercent: null,
      humidityPercent: 61,
      windSpeedMetersPerSecond: 3.1,
    });
  });

  it("maps short forecast temperature, sky, precipitation, wind and humidity", async () => {
    const setup = client(shortFixture, "2026-10-06T05:20:00Z");
    const weather = await setup.client.getWeather({
      locationId: LOCATION_ID,
      point: SEOUL,
      target: new Date("2026-10-07T05:40:00Z"),
    });
    expect(weather).toMatchObject({
      purpose: "short-forecast",
      forecastAt: "2026-10-07T15:00:00+09:00",
      temperatureCelsius: 19,
      skyCondition: "cloudy",
      precipitationProbabilityPercent: 70,
      humidityPercent: 82,
      windSpeedMetersPerSecond: 4.2,
    });
  });

  it("merges duplicate in-flight requests and then serves the bounded cycle cache", async () => {
    let resolveResponse!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => { resolveResponse = resolve; }));
    const weatherClient = new KmaWeatherClient({
      serviceKey: "key",
      fetcher: fetcher as unknown as typeof fetch,
      now: () => new Date("2026-10-06T05:50:00Z"),
      maxCacheEntries: 1,
    });
    const request = { locationId: LOCATION_ID, point: SEOUL };
    const first = weatherClient.getWeather(request);
    const second = weatherClient.getWeather(request);
    expect(fetcher).toHaveBeenCalledTimes(1);
    resolveResponse(jsonResponse(observationFixture));
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    await weatherClient.getWeather(request);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("classifies quota and malformed provider responses", async () => {
    const quota = client(quotaFixture, "2026-10-06T05:20:00Z");
    await expect(quota.client.getWeather({ locationId: LOCATION_ID, point: SEOUL }))
      .rejects.toMatchObject({ code: "QUOTA" });

    const malformed = client({ response: { header: { resultCode: "00" } } }, "2026-10-06T05:20:00Z");
    await expect(malformed.client.getWeather({ locationId: LOCATION_ID, point: SEOUL }))
      .rejects.toMatchObject({ code: "NO_DATA" });
  });

  it("accepts both official success-code representations", async () => {
    const numericStyle = structuredClone(observationFixture);
    numericStyle.response.header.resultCode = "0";
    const setup = client(numericStyle, "2026-10-06T05:50:00Z");
    await expect(setup.client.getWeather({ locationId: LOCATION_ID, point: SEOUL }))
      .resolves.toMatchObject({ temperatureCelsius: 21.4 });
  });

  it("returns explicit configuration, range, coverage and timeout errors", async () => {
    const noKey = new KmaWeatherClient({ serviceKey: undefined });
    await expect(noKey.getWeather({ locationId: LOCATION_ID, point: SEOUL }))
      .rejects.toMatchObject({ code: "CONFIGURATION" });

    const outOfRange = client(observationFixture, "2026-10-06T05:20:00Z");
    await expect(outOfRange.client.getWeather({
      locationId: LOCATION_ID,
      point: SEOUL,
      target: new Date("2026-10-11T05:20:00Z"),
    })).rejects.toMatchObject({ code: "OUT_OF_RANGE" });
    expect(outOfRange.fetcher).not.toHaveBeenCalled();

    const noCoverage = client(ultraFixture, "2026-10-06T05:50:00Z");
    await expect(noCoverage.client.getWeather({
      locationId: LOCATION_ID,
      point: SEOUL,
      target: new Date("2026-10-06T10:50:00Z"),
    })).rejects.toMatchObject({ code: "OUT_OF_RANGE" });

    const timeoutFetcher = vi.fn((_url: URL | RequestInfo, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const timeoutClient = new KmaWeatherClient({
      serviceKey: "key",
      fetcher: timeoutFetcher as unknown as typeof fetch,
      timeoutMilliseconds: 1,
      now: () => new Date("2026-10-06T05:20:00Z"),
    });
    await expect(timeoutClient.getWeather({ locationId: LOCATION_ID, point: SEOUL }))
      .rejects.toBeInstanceOf(KmaWeatherError);
    await expect(timeoutClient.getWeather({ locationId: LOCATION_ID, point: SEOUL }))
      .rejects.toMatchObject({ code: "TIMEOUT" });
  });
});
