import { describe, expect, it, vi } from "vitest";
import type { ParkingInfo } from "@/types/domain";
import type { DiscoveredPlace, PlaceDiscoveryAdapter } from "@/types/place-discovery";
import { createParkingProvider } from "./parking-provider";

const origin = { latitude: 35.159, longitude: 129.105 };

function place(id: string, northDegrees: number, overrides: Partial<DiscoveredPlace> = {}): DiscoveredPlace {
  return {
    id,
    name: `주차장 ${id}`,
    categoryName: "교통,수송 > 주차장",
    categoryGroupCode: "PK6",
    categoryGroupName: "주차장",
    phone: "051-123-4567",
    address: "부산 주소",
    roadAddress: null,
    point: { latitude: origin.latitude + northDegrees, longitude: origin.longitude },
    placeUrl: `https://place.map.kakao.com/${id}`,
    distanceMeters: 9999,
    source: "Kakao Local",
    ...overrides,
  };
}

function adapter(places: DiscoveredPlace[]) {
  const searchByCategory = vi.fn().mockResolvedValue({
    places,
    page: 1,
    size: 15,
    totalCount: places.length,
    pageableCount: places.length,
    isEnd: true,
  });
  return {
    searchByCategory,
    searchByKeyword: vi.fn(),
  } satisfies PlaceDiscoveryAdapter;
}

describe("nearby parking provider", () => {
  it("uses bounded PK6 search and returns at most five candidates in stable distance order", async () => {
    const discovery = adapter([
      place("6", 0.006), place("5", 0.005), place("4", 0.004),
      place("3", 0.003), place("2", 0.002), place("1", 0.001),
    ]);
    const result = await createParkingProvider(discovery).nearby(origin, { radiusMeters: 1_000 });

    expect(discovery.searchByCategory).toHaveBeenCalledWith({
      categoryGroupCode: "PK6",
      center: origin,
      radiusMeters: 1_000,
      page: 1,
      size: 15,
      sort: "distance",
    }, { signal: undefined });
    expect(result.map((candidate) => candidate.providerPlaceId)).toEqual(["1", "2", "3", "4", "5"]);
    expect(result).toHaveLength(5);
    expect(result[0]).toMatchObject({
      id: "kakao-local:1",
      relationship: "nearby",
      capacity: null,
      openingHours: null,
      priceInfo: null,
    });
    expect(result[0].distanceMeters).toBeGreaterThan(100);
    expect(result[0].distanceMeters).not.toBe(9999);
  });

  it("drops provider duplicates, static duplicates, unsafe phones, and out-of-radius rows", async () => {
    const staticParking: ParkingInfo[] = [{
      id: "static",
      locationId: null,
      relationship: "nearby",
      name: "이미 등록된 주차장",
      point: { latitude: origin.latitude + 0.001, longitude: origin.longitude },
      capacity: null,
      openingHours: null,
      priceInfo: null,
      source: null,
      sourceUrl: null,
      referenceDate: null,
      lastVerifiedAt: null,
    }];
    const discovery = adapter([
      place("1", 0.001, { name: "이미 등록된 주차장" }),
      place("2", 0.002, { phone: "javascript:alert(1)" }),
      place("2", 0.002),
      place("3", 0.02),
    ]);

    const result = await createParkingProvider(discovery).nearby(origin, {
      radiusMeters: 1_000,
      excludedParking: staticParking,
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ providerPlaceId: "2", phone: null });
  });
});
