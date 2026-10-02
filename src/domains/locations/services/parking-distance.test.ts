import { describe, expect, it } from "vitest";
import { sortParkingByDistance } from "./parking-distance";
import type { ParkingInfo } from "@/types/domain";

function parking(
  id: string,
  latitude: number,
  longitude: number,
): ParkingInfo {
  return {
    id,
    locationId: null,
    name: id,
    point: { latitude, longitude },
    capacity: null,
    openingHours: null,
    priceInfo: null,
    source: null,
  };
}

describe("sortParkingByDistance", () => {
  it("sorts parking from nearest to farthest", () => {
    const origin = { latitude: 37.5665, longitude: 126.978 };
    const items = [
      parking("far", 37.5765, 126.978),
      parking("same", 37.5665, 126.978),
      parking("near", 37.5675, 126.978),
    ];

    const result = sortParkingByDistance(origin, items);

    expect(result.map(({ parking: item }) => item.id)).toEqual([
      "same",
      "near",
      "far",
    ]);
    expect(result[0].distanceMeters).toBe(0);
    expect(result[1].distanceMeters).toBeGreaterThan(100);
  });

  it("places invalid coordinates last and does not mutate input", () => {
    const origin = { latitude: 37.5665, longitude: 126.978 };
    const items = [
      parking("invalid", Number.NaN, 126.978),
      parking("valid", 37.5665, 126.978),
    ];
    const originalOrder = items.map((item) => item.id);

    const result = sortParkingByDistance(origin, items);

    expect(result.map(({ parking: item }) => item.id)).toEqual([
      "valid",
      "invalid",
    ]);
    expect(result[1].distanceMeters).toBeNull();
    expect(items.map((item) => item.id)).toEqual(originalOrder);
  });
});
