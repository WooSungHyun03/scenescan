import { beforeEach, describe, expect, it, vi } from "vitest";
import { KakaoLocalError } from "@/infrastructure/kakao/local-error";
import type { PlaceDiscoveryAdapter } from "@/types/place-discovery";

const getLocationMock = vi.fn();
vi.mock("./repository", () => ({
  getLocation: (...args: unknown[]) => getLocationMock(...args),
}));

const { createParkingFixtureAdapter, getNearbyParking } = await import("./parking");
const LOCATION_ID = "11111111-1111-4111-8111-111111111111";
const point = { latitude: 35.159, longitude: 129.105 };

beforeEach(() => {
  getLocationMock.mockReset();
  getLocationMock.mockResolvedValue({ id: LOCATION_ID, point, parking: [] });
});

describe("nearby parking server service", () => {
  it("returns deterministic key-free fixtures that expand with the radius", async () => {
    const adapter = createParkingFixtureAdapter(LOCATION_ID, point);
    const near = await getNearbyParking(LOCATION_ID, 1_000, undefined, {
      adapter,
      sourceMode: "fixture",
    });
    const wide = await getNearbyParking(LOCATION_ID, 5_000, undefined, {
      adapter,
      sourceMode: "fixture",
    });
    expect(near.candidates).toHaveLength(2);
    expect(wide.candidates).toHaveLength(5);
    expect(wide.candidates.slice(0, 2).map((item) => item.id))
      .toEqual(near.candidates.map((item) => item.id));
    expect(wide.candidates.every((item) => item.source === "SceneScan synthetic fixture"))
      .toBe(true);
  });

  it("does not call a provider for an unknown location", async () => {
    getLocationMock.mockResolvedValue(null);
    const searchByCategory = vi.fn();
    await expect(getNearbyParking(LOCATION_ID, 1_000, undefined, {
      adapter: { searchByCategory, searchByKeyword: vi.fn() },
      sourceMode: "live",
    })).rejects.toMatchObject({ code: "LOCATION_NOT_FOUND", status: 404 });
    expect(searchByCategory).not.toHaveBeenCalled();
  });

  it.each([
    ["QUOTA", "RATE_LIMITED", 429],
    ["FORBIDDEN", "DATA_UNAVAILABLE", 503],
    ["TIMEOUT", "DATA_UNAVAILABLE", 503],
  ] as const)("maps %s provider failures without leaking them", async (providerCode, code, status) => {
    const adapter: PlaceDiscoveryAdapter = {
      searchByKeyword: vi.fn(),
      searchByCategory: vi.fn().mockRejectedValue(
        new KakaoLocalError(providerCode, "private provider detail"),
      ),
    };
    await expect(getNearbyParking(LOCATION_ID, 1_000, undefined, {
      adapter,
      sourceMode: "live",
    })).rejects.toMatchObject({ code, status });
  });
});
