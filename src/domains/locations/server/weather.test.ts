import { describe, expect, it, vi } from "vitest";

import type { Location } from "@/types/domain";
import type { LocationWeather } from "@/types/weather";
import { KmaWeatherError } from "@/infrastructure/weather/kma-client";
import { getLocationWeather } from "./weather";

const LOCATION_ID = "11111111-1111-4111-8111-111111111111";
const location = {
  id: LOCATION_ID,
  point: { latitude: 37.5665, longitude: 126.978 },
} as Location;
const weather = {
  locationId: LOCATION_ID,
  purpose: "observation",
} as LocationWeather;

describe("getLocationWeather", () => {
  it("loads the location and forwards its point and requested time", async () => {
    const target = new Date("2026-10-06T05:20:00Z");
    const getWeather = vi.fn().mockResolvedValue(weather);
    await expect(getLocationWeather(LOCATION_ID, target, {
      findLocation: vi.fn().mockResolvedValue(location),
      weatherClient: { getWeather },
    })).resolves.toBe(weather);
    expect(getWeather).toHaveBeenCalledWith({ locationId: LOCATION_ID, point: location.point, target });
  });

  it("maps missing locations and provider failures to shared application errors", async () => {
    await expect(getLocationWeather(LOCATION_ID, undefined, {
      findLocation: vi.fn().mockResolvedValue(null),
      weatherClient: { getWeather: vi.fn() },
    })).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND", status: 404 });

    for (const [providerCode, applicationCode, status] of [
      ["OUT_OF_RANGE", "VALIDATION_ERROR", 400],
      ["GRID_OUT_OF_RANGE", "VALIDATION_ERROR", 400],
      ["QUOTA", "RATE_LIMITED", 429],
      ["CONFIGURATION", "DATA_UNAVAILABLE", 503],
      ["TIMEOUT", "DATA_UNAVAILABLE", 503],
      ["NO_DATA", "DATA_UNAVAILABLE", 503],
      ["UPSTREAM", "DATA_UNAVAILABLE", 503],
    ] as const) {
      await expect(getLocationWeather(LOCATION_ID, undefined, {
        findLocation: vi.fn().mockResolvedValue(location),
        weatherClient: { getWeather: vi.fn().mockRejectedValue(new KmaWeatherError(providerCode, "private")) },
      })).rejects.toMatchObject({ code: applicationCode, status });
    }
  });
});
