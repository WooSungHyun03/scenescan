import { describe, expect, it } from "vitest";
import {
  categoryPlaceSearchRequestSchema,
  discoveredPlaceSchema,
  keywordPlaceSearchRequestSchema,
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
