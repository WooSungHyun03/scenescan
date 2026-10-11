import { beforeEach, describe, expect, it, vi } from "vitest";
import { notFoundError, rateLimitedError } from "@/shared/errors/application-error";

const getNearbyParkingMock = vi.fn();
vi.mock("@/domains/locations/server/parking", () => ({
  getNearbyParking: (...args: unknown[]) => getNearbyParkingMock(...args),
}));

const { GET } = await import("./route");
const VALID_ID = "11111111-1111-4111-8111-111111111111";

function responseFixture(radiusMeters = 1_000) {
  return { locationId: VALID_ID, radiusMeters, candidates: [], sourceMode: "fixture" as const };
}

function call(id: string, query = "") {
  return GET(new Request(`http://localhost/api/locations/${id}/parking${query}`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => getNearbyParkingMock.mockReset());

describe("GET /api/locations/[id]/parking", () => {
  it("validates id, radius, and unknown query keys before provider access", async () => {
    expect((await call("bad-id")).status).toBe(400);
    expect((await call(VALID_ID, "?radius=99")).status).toBe(400);
    expect((await call(VALID_ID, "?radius=1000.5")).status).toBe(400);
    expect((await call(VALID_ID, "?unknown=1")).status).toBe(400);
    expect(getNearbyParkingMock).not.toHaveBeenCalled();
  });

  it("defaults to one kilometre and returns a no-store response", async () => {
    getNearbyParkingMock.mockResolvedValue(responseFixture());
    const response = await call(VALID_ID);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual(responseFixture());
    expect(getNearbyParkingMock).toHaveBeenCalledWith(VALID_ID, 1_000, expect.any(AbortSignal));
  });

  it("passes widened radius and preserves structured not-found/quota errors", async () => {
    getNearbyParkingMock.mockResolvedValueOnce(responseFixture(5_000));
    expect((await call(VALID_ID, "?radius=5000")).status).toBe(200);
    expect(getNearbyParkingMock).toHaveBeenLastCalledWith(VALID_ID, 5_000, expect.any(AbortSignal));

    getNearbyParkingMock.mockRejectedValueOnce(notFoundError("missing"));
    expect((await call(VALID_ID)).status).toBe(404);
    getNearbyParkingMock.mockRejectedValueOnce(rateLimitedError("quota", 30));
    const quota = await call(VALID_ID);
    expect(quota.status).toBe(429);
    expect(quota.headers.get("Retry-After")).toBe("30");
  });

  it("rejects malformed provider output at the route boundary", async () => {
    getNearbyParkingMock.mockResolvedValue({ ...responseFixture(), candidates: [{ id: "bad" }] });
    const response = await call(VALID_ID);
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "SEARCH_FAILED" } });
  });
});
