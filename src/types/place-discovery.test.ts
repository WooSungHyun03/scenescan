import { describe, expect, it } from "vitest";
import {
  categoryPlaceSearchRequestSchema,
  discoveredPlaceSchema,
  keywordPlaceSearchRequestSchema,
  nearbyParkingResponseSchema,
} from "./place-discovery";

describe("place discovery contract", () => {
  it("applies bounded Kakao pagination defaults", () => {
    expect(keywordPlaceSearchRequestSchema.parse({ query: " 주차장 " })).toMatchObject({
      query: "주차장",
      page: 1,
      size: 15,
      sort: "accuracy",
    });
    expect(() => keywordPlaceSearchRequestSchema.parse({ query: "주차장", page: 46 }))
      .toThrow();
  });

  it("requires a valid center and radius for category search", () => {
    expect(() => categoryPlaceSearchRequestSchema.parse({
      categoryGroupCode: "PK6",
      center: { latitude: 91, longitude: 129.1 },
      radiusMeters: 500,
    })).toThrow();
    expect(() => categoryPlaceSearchRequestSchema.parse({
      categoryGroupCode: "PK6",
      center: { latitude: 35.1, longitude: 129.1 },
      radiusMeters: 20_001,
    })).toThrow();
  });

  it("accepts only canonical HTTPS Kakao place links in normalized output", () => {
    const place = {
      id: "123",
      name: "공영주차장",
      categoryName: "교통 > 주차장",
      categoryGroupCode: "PK6",
      categoryGroupName: "주차장",
      phone: null,
      address: "부산광역시",
      roadAddress: null,
      point: { latitude: 35.1, longitude: 129.1 },
      placeUrl: "https://place.map.kakao.com/123",
      distanceMeters: 30,
      source: "Kakao Local",
    } as const;
    expect(discoveredPlaceSchema.parse(place)).toEqual(place);
    expect(() => discoveredPlaceSchema.parse({
      ...place,
      placeUrl: "https://evil.example/123",
    })).toThrow();
  });
});

describe("nearby parking response contract", () => {
  const candidate = {
    id: "kakao-local:123",
    providerPlaceId: "123",
    relationship: "nearby",
    name: "부산시민공원 주차장",
    address: "부산 부산진구 시민공원로 73",
    phone: "051-123-4567",
    placeUrl: "https://place.map.kakao.com/123",
    point: { latitude: 35.1667, longitude: 129.057 },
    distanceMeters: 42,
    capacity: null,
    openingHours: null,
    priceInfo: null,
    source: "Kakao Local",
  };

  it("keeps unprovided operational fields null and accepts safe contact metadata", () => {
    expect(nearbyParkingResponseSchema.parse({
      locationId: "11111111-1111-4111-8111-111111111111",
      radiusMeters: 1_000,
      candidates: [candidate],
      sourceMode: "live",
    }).candidates[0]).toEqual(candidate);
  });

  it.each([
    { phone: "javascript:alert(1)" },
    { placeUrl: "https://evil.example/123" },
    { capacity: 10 },
  ])("rejects unsafe or inferred dynamic metadata", (change) => {
    expect(nearbyParkingResponseSchema.safeParse({
      locationId: "11111111-1111-4111-8111-111111111111",
      radiusMeters: 1_000,
      candidates: [{ ...candidate, ...change }],
      sourceMode: "live",
    }).success).toBe(false);
  });
});
