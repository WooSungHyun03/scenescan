import { describe, expect, it } from "vitest";
import type { ParsedTextSearchQuery } from "@/types/text-search";
import { getMockLocation, getMockLocations, getMockSimilarLocations, searchMockLocations, searchMockLocationsByText } from "./mock-repository";

function parsedQuery(overrides: Partial<ParsedTextSearchQuery> = {}): ParsedTextSearchQuery {
  return {
    district: null,
    category: null,
    keywords: [],
    districtConflict: false,
    conflictingDistricts: [],
    outOfScope: false,
    unsupportedConditions: [],
    ...overrides,
  };
}

// Fixture ids are fixed UUIDs (src/domains/locations/fixtures/locations.ts)
// so mock-mode data can exercise real uuid-shaped code paths (e.g.
// GET /api/locations/[id]/similar's path-param validation). fixtureId(1)
// corresponds to demo-01 (청록 창고, industrial/busan_haeundae_gu) and so on
// in seed order; demo-01/02/04 share busan_haeundae_gu, demo-10 has a null
// (unconfirmed) district.
function fixtureId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

describe("mock location repository", () => {
  it("filters fixtures and returns no more than eight search results", () => {
    expect(getMockLocations()).toHaveLength(10);
    expect(getMockLocations({ region: "부산" }).every((item) => item.region === "부산")).toBe(true);
    const haeundae = getMockLocations({ district: "busan_haeundae_gu" });
    expect(haeundae.length).toBeGreaterThan(0);
    expect(haeundae.length).toBeLessThan(10);
    expect(haeundae.every((item) => item.district === "busan_haeundae_gu")).toBe(true);
    expect(getMockLocation("missing")).toBeNull();
    expect(searchMockLocations(Array(512).fill(0))).toHaveLength(8);
  });

  it("returns locations in a deterministic (name, then id) order", () => {
    const names = getMockLocations().map((location) => location.name);
    const sorted = [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(names).toEqual(sorted);
  });

  it("search: a district filter excludes a higher-similarity out-of-district hit instead of dropping it silently after the fact", () => {
    // phase = 8 with this embedding[0] -> the globally top-scoring fixture
    // (fixture 3, district busan_suyeong_gu) is deliberately NOT in district
    // busan_haeundae_gu. If filtering happened only via
    // groupImageMatches's eligibleLocationIds (the pre-RPC-filter behavior
    // this mirrors), an implementation bug could still let it leak through;
    // filtering the candidate list before grouping (matching the SQL
    // filter_district behavior) must not do that.
    const embedding = Array(512).fill(0);
    embedding[0] = 0.008;
    const unfiltered = searchMockLocations(embedding);
    expect(unfiltered[0]?.location.district).toBe("busan_suyeong_gu");

    const filtered = searchMockLocations(embedding, { district: "busan_haeundae_gu" });
    expect(filtered.every((result) => result.location.district === "busan_haeundae_gu")).toBe(true);
    expect(filtered.some((result) => result.location.id === fixtureId(3))).toBe(false);
    expect(filtered[0]?.location.id).toBe(fixtureId(4));
  });

  it("search: threshold excludes lower-similarity candidates before grouping", () => {
    const embedding = Array(512).fill(0);
    const all = searchMockLocations(embedding);
    const minSimilarity = Math.min(...all.map((result) => result.similarity));
    const filtered = searchMockLocations(embedding, {}, { threshold: minSimilarity + 0.001 });
    expect(filtered.every((result) => result.similarity >= minSimilarity + 0.001)).toBe(true);
    expect(filtered.length).toBeLessThan(all.length);
  });

  it("similar locations: never includes the location itself, even though nothing could be more 'similar' to it", () => {
    // fixture 1 is the only 서울/industrial fixture, paired with fixture 7
    // (industrial, 부산) as its one same-category peer -- mirrors the SQL
    // regression in docs/search-ranking.md, structurally guaranteed here
    // because the candidate set is built from a category filter that never
    // included the location itself in the first place.
    const similar = getMockSimilarLocations(fixtureId(1));
    expect(similar.some((result) => result.location.id === fixtureId(1))).toBe(false);
    expect(similar.every((result) => result.location.category === "industrial")).toBe(true);
    expect(similar.map((result) => result.location.id)).toContain(fixtureId(7));
  });

  it("similar locations: a nonexistent location returns an empty array, not an error", () => {
    expect(getMockSimilarLocations("missing")).toEqual([]);
  });

  it("text search: matches a keyword against a tag, with an accurate matchedOn reason", () => {
    const results = searchMockLocationsByText(parsedQuery({ keywords: ["바다"] }));
    expect(results).toHaveLength(1);
    expect(results[0].location.id).toBe(fixtureId(3));
    expect(results[0].score).toBe(1);
    expect(results[0].matchedOn).toEqual([{ field: "tag", keyword: "바다" }]);
  });

  it("text search: matches a keyword against a name (and its alias, since both fixture strings contain it)", () => {
    const results = searchMockLocationsByText(parsedQuery({ keywords: ["은빛"] }));
    expect(results.map((result) => result.location.id)).toEqual([fixtureId(4)]);
    expect(results[0].matchedOn).toEqual(expect.arrayContaining([
      { field: "name", keyword: "은빛" },
      { field: "alias", keyword: "은빛" },
    ]));
  });

  it("text search: a no-such-place query returns an empty result, not an error", () => {
    expect(searchMockLocationsByText(parsedQuery({ keywords: ["존재하지않는장소이름"] }))).toEqual([]);
  });

  it("text search: district + category filters apply before keyword scoring", () => {
    const results = searchMockLocationsByText(parsedQuery({ district: "busan_yeongdo_gu", category: "interior", keywords: [] }));
    expect(results.map((result) => result.location.id)).toEqual([fixtureId(8)]);
  });

  it("text search: an empty keyword list returns every eligible location, deterministically ordered by location id", () => {
    const results = searchMockLocationsByText(parsedQuery({ district: "busan_haeundae_gu" }));
    expect(results.map((result) => result.location.id)).toEqual([fixtureId(1), fixtureId(2), fixtureId(4)]);
    expect(results.every((result) => result.score === 0 && result.matchedOn.length === 0)).toBe(true);
  });

  it("text search: deterministic ranking sorts by score descending, then location id ascending", () => {
    // "실내" matches fixture 4's tag and fixture 8's tag; "스튜디오" additionally
    // matches fixture 4's name and tag, so fixture 4 scores higher.
    const results = searchMockLocationsByText(parsedQuery({ keywords: ["실내", "스튜디오"] }));
    expect(results.map((result) => result.location.id)).toEqual([fixtureId(4), fixtureId(8)]);
    expect(results[0].score).toBeGreaterThan(results[1].score);
  });

  it("distinguishes on-site parking from nearby parking fixtures", () => {
    const onSite = getMockLocation(fixtureId(1));
    const nearby = getMockLocation(fixtureId(2));

    expect(onSite?.parking[0].locationId).toBe(onSite?.id);
    expect(onSite?.parking[0].point).toEqual(onSite?.point);
    expect(nearby?.parking[0].locationId).toBeNull();
    expect(nearby?.parking[0].point).not.toEqual(nearby?.point);
  });
});
