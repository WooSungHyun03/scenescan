import { describe, expect, it } from "vitest";
import {
  matchLocationImagesRowSchema,
  parseLocationRow,
  parseLocationRows,
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
    region: "부산",
    address: "주소",
    latitude: 37.5,
    longitude: 127.0,
    permit_type: "정보 확인 필요",
    contact_name: null,
    contact_phone: null,
    permit_note: null,
    source_url: null,
    location_images: [{ id: "img-1", image_url: "https://example.com/a.jpg", alt: "설명" }],
    parking: [{
      id: "park-1", name: "주차장", relationship: "on_site", latitude: 37.5, longitude: 127.0,
      capacity: 3, opening_hours: "09-18", price_info: "무료", source: "manual",
      source_url: "https://example.com/parking", reference_date: "2026-05-01", last_verified_at: "2026-10-04T00:00:00Z",
    }],
    ...overrides,
  };
}

describe("toLocation", () => {
  it("drops unsafe images and parking coordinates, rejecting invalid location coordinates", () => {
    const { location, warnings } = toLocation(baseRow({ location_images: [{ id: "bad", image_url: "javascript:alert(1)", alt: null }], parking: [{ id: "bad", name: "invalid", latitude: 100, longitude: 0, capacity: null, opening_hours: null, price_info: null, source: null }] }));
    expect(location.images).toEqual([]);
    expect(location.parking).toEqual([]);
    expect(warnings).toHaveLength(2);
    expect(() => parseLocationRow(baseRow({ latitude: 100 }))).toThrow();
  });
  it("maps a normal row with no warnings", () => {
    const { location, warnings } = toLocation(baseRow());
    expect(warnings).toHaveLength(0);
    expect(location.images).toEqual([{
      id: "img-1", locationId: "loc-1", imageUrl: "https://example.com/a.jpg", alt: "설명",
      source: null, sourceUrl: null, author: null, license: null, licenseUrl: null, lastVerifiedAt: null,
    }]);
    expect(location.parking).toHaveLength(1);
    expect(location.parking[0]).toMatchObject({
      relationship: "on_site",
      sourceUrl: "https://example.com/parking",
      referenceDate: "2026-05-01",
      lastVerifiedAt: "2026-10-04T00:00:00Z",
    });
    expect(location.sourceUrl).toBeNull();
    expect(location.source).toBeNull();
    expect(location.author).toBeNull();
    expect(location.license).toBeNull();
    expect(location.licenseUrl).toBeNull();
    expect(location.lastVerifiedAt).toBeNull();
    expect(location.permit).toEqual({
      type: "정보 확인 필요",
      contactName: null,
      contactPhone: null,
      note: null,
      source: null,
      sourceUrl: null,
      referenceDate: null,
      lastVerifiedAt: null,
    });
  });

  it("maps permit-specific provenance independently from the location source", () => {
    const { location } = toLocation(baseRow({
      permit_source: "Official filming guide",
      permit_source_url: "https://example.com/permit",
      permit_reference_date: "2026-01-01",
      permit_last_verified_at: "2026-10-03T03:00:00Z",
      source: "Wikidata",
      source_url: "https://www.wikidata.org/wiki/Q1",
    }));
    expect(location.permit).toMatchObject({
      source: "Official filming guide",
      sourceUrl: "https://example.com/permit",
      referenceDate: "2026-01-01",
      lastVerifiedAt: "2026-10-03T03:00:00Z",
    });
  });

  it("maps a recognized district value", () => {
    const { location, warnings } = toLocation(baseRow({ district: "busan_haeundae_gu" }));
    expect(location.district).toBe("busan_haeundae_gu");
    expect(warnings).toEqual([]);
  });

  it("treats a missing district column (pre-migration rollout) as null, not a warning", () => {
    const row = baseRow();
    delete (row as Record<string, unknown>).district;
    const { location, warnings } = toLocation(row);
    expect(location.district).toBeNull();
    expect(warnings).toEqual([]);
  });

  it("drops an unrecognized district value and reports a warning instead of inventing one", () => {
    const { location, warnings } = toLocation(baseRow({ district: "서울_중구" }));
    expect(location.district).toBeNull();
    expect(warnings).toEqual([{ field: "district", reason: "unrecognized district value", value: "서울_중구" }]);
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
    expect(location.parking[0].relationship).toBe("nearby");
  });

});

describe("parseLocationRows / parseLocationRow (locations select response validation)", () => {
  // Legacy, pre-attribution-migration shape: PostgREST/supabase-js never
  // sends `source`/`author`/`license`/`license_url`/`last_verified_at` keys
  // at all here (not null values -- the keys are simply absent), since
  // LEGACY_LOCATION_SELECT (supabase-repository.ts's fallback for a
  // 42703/PGRST204 "column does not exist" retry) never asks for them.
  // These schemas must accept that shape too, not just the full one.
  function legacyRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "loc-1", name: "테스트 장소", description: "설명", category: "urban", region: "부산",
      address: "주소", latitude: 37.5, longitude: 127.0, permit_type: "정보 확인 필요",
      contact_name: null, contact_phone: null, permit_note: null, source_url: null,
      location_images: [{ id: "img-1", image_url: "https://example.com/a.jpg", alt: null }],
      parking: [],
      ...overrides,
    };
  }

  it("accepts a row with every attribution key present (post-migration shape)", () => {
    const rows = parseLocationRows([{
      ...legacyRow(),
      source: "Wikidata", author: "A", license: "CC BY 4.0", license_url: "https://x", last_verified_at: "2026-01-01T00:00:00Z",
      location_images: [{ id: "img-1", image_url: "https://example.com/a.jpg", alt: null, source: "Commons", source_url: null, author: null, license: null, license_url: null, last_verified_at: null }],
    }]);
    expect(rows).toHaveLength(1);
  });

  it("accepts a row missing every attribution key entirely (legacy/pre-migration shape) without throwing", () => {
    expect(() => parseLocationRows([legacyRow()])).not.toThrow();
    expect(() => parseLocationRow(legacyRow())).not.toThrow();
    const [row] = parseLocationRows([legacyRow()]);
    expect(row.source).toBeUndefined();
    expect(row.last_verified_at).toBeUndefined();
  });

  it("parseLocationRows treats a null/undefined response as zero rows", () => {
    expect(parseLocationRows(null)).toEqual([]);
    expect(parseLocationRows(undefined)).toEqual([]);
  });

  it("parseLocationRow treats a null/undefined response as no row (not a parse error)", () => {
    expect(parseLocationRow(null)).toBeNull();
    expect(parseLocationRow(undefined)).toBeNull();
  });

  it("throws a clear error when a required scalar column is missing -- a select-string bug, not bad data", () => {
    const withoutName: Record<string, unknown> = legacyRow();
    delete withoutName.name;
    expect(() => parseLocationRows([withoutName])).toThrow();
    expect(() => parseLocationRow(withoutName)).toThrow();
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
