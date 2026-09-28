import { describe, expect, it } from "vitest";
import {
  matchLocationImagesRowSchema,
  parseMatchLocationImagesRows,
  toImageMatch,
  toLocation,
  type LocationRow,
} from "./supabase-mappers";

function baseRow(overrides: Partial<LocationRow> = {}): LocationRow {
  return {
    id: "loc-1",
    name: "테스트 장소",
    description: "설명",
    category: "urban",
    region: "서울",
    address: "주소",
    latitude: 37.5,
    longitude: 127.0,
    permit_type: "정보 확인 필요",
    contact_name: null,
    contact_phone: null,
    permit_note: null,
    noise_sources: null,
    source_url: null,
    location_images: [{ id: "img-1", image_url: "https://example.com/a.jpg", alt: "설명" }],
    parking: [{ id: "park-1", name: "주차장", latitude: 37.5, longitude: 127.0, capacity: 3, opening_hours: "09-18", price_info: "무료", source: "manual" }],
    ...overrides,
  };
}

describe("toLocation", () => {
  it("maps a normal row with no warnings", () => {
    const { location, warnings } = toLocation(baseRow());
    expect(warnings).toHaveLength(0);
    expect(location.images).toEqual([{ id: "img-1", locationId: "loc-1", imageUrl: "https://example.com/a.jpg", alt: "설명" }]);
    expect(location.parking).toHaveLength(1);
    expect(location.noiseSources).toEqual([]);
    expect(location.sourceUrl).toBeNull();
  });

  it("returns an empty images array with no warnings when location_images is null", () => {
    const { location, warnings } = toLocation(baseRow({ location_images: null }));
    expect(location.images).toEqual([]);
    expect(warnings).toHaveLength(0);
  });

  it("returns an empty parking array with no warnings when parking is null", () => {
    const { location, warnings } = toLocation(baseRow({ parking: null }));
    expect(location.parking).toEqual([]);
    expect(warnings).toHaveLength(0);
  });

  it("drops a malformed image row and reports a warning instead of throwing", () => {
    const { location, warnings } = toLocation(baseRow({
      location_images: [
        { id: "img-1", image_url: "https://example.com/a.jpg", alt: null },
        { id: "", image_url: "https://example.com/broken.jpg", alt: null },
      ],
    }));
    expect(location.images).toHaveLength(1);
    expect(location.images[0].alt).toBe("테스트 장소");
    expect(warnings).toEqual([{ field: "location_images", reason: expect.any(String), value: expect.objectContaining({ id: "" }) }]);
  });

  it("drops a malformed parking row (non-finite coordinate) and reports a warning", () => {
    const { location, warnings } = toLocation(baseRow({
      parking: [{ id: "park-1", name: "주차장", latitude: Number.NaN, longitude: 127.0, capacity: null, opening_hours: null, price_info: null, source: null }],
    }));
    expect(location.parking).toEqual([]);
    expect(warnings).toEqual([{ field: "parking", reason: expect.any(String), value: expect.anything() }]);
  });

  it("treats blank optional strings as null instead of passing them through", () => {
    const { location } = toLocation(baseRow({
      parking: [{ id: "park-1", name: "주차장", latitude: 1, longitude: 1, capacity: null, opening_hours: "   ", price_info: "", source: null }],
    }));
    expect(location.parking[0].openingHours).toBeNull();
    expect(location.parking[0].priceInfo).toBeNull();
  });
});

describe("match_location_images row validation", () => {
  it("accepts a well-formed row and maps it to an ImageMatch", () => {
    const row = matchLocationImagesRowSchema.parse({
      image_id: "11111111-1111-4111-8111-111111111111",
      location_id: "22222222-2222-4222-8222-222222222222",
      image_url: "https://example.com/a.jpg",
      similarity: 0.87,
    });
    expect(toImageMatch(row)).toEqual({
      locationImageId: "11111111-1111-4111-8111-111111111111",
      locationId: "22222222-2222-4222-8222-222222222222",
      similarity: 0.87,
    });
  });

  it("treats a missing/null response as zero rows instead of throwing", () => {
    expect(parseMatchLocationImagesRows(null)).toEqual([]);
    expect(parseMatchLocationImagesRows(undefined)).toEqual([]);
  });

  it("throws a clear error for an unexpected shape instead of failing deep in the ranker", () => {
    expect(() => parseMatchLocationImagesRows([{ location_id: "not-a-uuid", similarity: "0.9" }])).toThrow();
    expect(() => parseMatchLocationImagesRows("not-an-array")).toThrow();
    expect(() => parseMatchLocationImagesRows([{ image_id: "1", location_id: "2", image_url: "x", similarity: Number.NaN }])).toThrow();
  });

  it("accepts similarity at the cosine range's inclusive boundaries (-1 and 1)", () => {
    for (const similarity of [-1, 1]) {
      expect(() => matchLocationImagesRowSchema.parse({
        image_id: "11111111-1111-4111-8111-111111111111", location_id: "22222222-2222-4222-8222-222222222222",
        image_url: "https://example.com/a.jpg", similarity,
      })).not.toThrow();
    }
  });

  it("does not itself reject a finite similarity outside the cosine range [-1, 1] -- that's intentionally the ranker's job, not the RPC-row schema's", () => {
    // src/domains/locations/services/location-ranking.ts's isUsableHit
    // filters similarity to [-1, 1] as part of its own defensive checks
    // (see its test suite). This schema only guards the RPC response's
    // *shape* (finite number, right fields); duplicating the range check
    // here would just be two places to keep in sync for no benefit.
    const row = matchLocationImagesRowSchema.parse({
      image_id: "11111111-1111-4111-8111-111111111111", location_id: "22222222-2222-4222-8222-222222222222",
      image_url: "https://example.com/a.jpg", similarity: 1.5,
    });
    expect(row.similarity).toBe(1.5);
  });
});
