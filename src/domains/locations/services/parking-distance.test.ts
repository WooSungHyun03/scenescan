import { describe, expect, it } from "vitest";
import { formatStraightLineDistance, getStraightLineDistanceMeters, sortParkingByDistance } from "./parking-distance";
import type { ParkingInfo } from "@/types/domain";

function parking(
  id: string,
  latitude: number,
  longitude: number,
): ParkingInfo {
  return {
    id,
    locationId: null,
    relationship: "nearby",
    name: id,
    point: { latitude, longitude },
    capacity: null,
    openingHours: null,
    priceInfo: null,
    source: null,
    sourceUrl: null,
    referenceDate: null,
    lastVerifiedAt: null,
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

describe("formatStraightLineDistance", () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])("does not label invalid distance %s as a real measurement", (distance) => {
    expect(formatStraightLineDistance(distance)).toBe("거리 정보 없음");
  });
  it("uses one Korean distance rule for every location surface", () => {
    expect(formatStraightLineDistance(null)).toBe("거리 정보 없음");
    expect(formatStraightLineDistance(412.4)).toBe("직선거리 412m");
    expect(formatStraightLineDistance(1_250)).toBe("직선거리 1.3km");
  });
});

it("returns a finite distance for antipodal valid coordinates despite floating point rounding", () => {
  const distance = getStraightLineDistanceMeters({ latitude: 8, longitude: 0 }, { latitude: -8, longitude: 180 });
  expect(distance).not.toBeNull();
  expect(Number.isFinite(distance)).toBe(true);
  expect(distance!).toBeCloseTo(Math.PI * 6_371_000, 3);
});
