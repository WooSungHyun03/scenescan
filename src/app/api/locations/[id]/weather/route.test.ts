import { beforeEach, describe, expect, it, vi } from "vitest";

import { notFoundError, rateLimitedError } from "@/shared/errors/application-error";

const getLocationWeatherMock = vi.fn();
vi.mock("@/domains/locations/server/weather", () => ({
  getLocationWeather: (...args: unknown[]) => getLocationWeatherMock(...args),
}));

const { GET } = await import("./route");
const VALID_ID = "11111111-1111-4111-8111-111111111111";

function call(id: string, query = "") {
  return GET(new Request(`http://localhost/api/locations/${id}/weather${query}`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => getLocationWeatherMock.mockReset());

describe("GET /api/locations/[id]/weather", () => {
  it("validates the location id and offset-aware ISO target", async () => {
    expect((await call("bad-id")).status).toBe(400);
    expect((await call(VALID_ID, "?at=2026-10-06T14%3A00%3A00")).status).toBe(400);
    expect((await call(VALID_ID, "?unknown=value")).status).toBe(400);
    expect(getLocationWeatherMock).not.toHaveBeenCalled();
  });

  it("returns the weather contract and passes the target instant", async () => {
    const weather = { locationId: VALID_ID, purpose: "short-forecast" };
    getLocationWeatherMock.mockResolvedValue(weather);
    const response = await call(VALID_ID, "?at=2026-10-07T15%3A00%3A00%2B09%3A00");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("max-age=60");
    await expect(response.json()).resolves.toEqual({ weather });
    expect(getLocationWeatherMock).toHaveBeenCalledWith(
      VALID_ID,
      new Date("2026-10-07T15:00:00+09:00"),
    );
  });

  it("keeps not-found and quota failures in the structured error contract", async () => {
    getLocationWeatherMock.mockRejectedValueOnce(notFoundError("missing"));
    const missing = await call(VALID_ID);
    expect(missing.status).toBe(404);
    await expect(missing.json()).resolves.toMatchObject({ error: { code: "LOCATION_NOT_FOUND" } });

    getLocationWeatherMock.mockRejectedValueOnce(rateLimitedError("quota", 60));
    const quota = await call(VALID_ID);
    expect(quota.status).toBe(429);
    expect(quota.headers.get("Retry-After")).toBe("60");
    await expect(quota.json()).resolves.toMatchObject({ error: { code: "RATE_LIMITED" } });
  });
});
