import { describe, expect, it } from "vitest";
import { getMockLocation, getMockLocations, getMockSimilarLocations, searchMockLocations } from "./mock-repository";

// Fixture ids are fixed UUIDs (src/domains/locations/fixtures/locations.ts)
// so mock-mode data can exercise real uuid-shaped code paths (e.g.
// GET /api/locations/[id]/similar's path-param validation). fixtureId(1)
// corresponds to demo-01 (청록 창고, industrial/서울) and so on in seed order.
function fixtureId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

describe("mock location repository", () => {
  it("filters fixtures and returns no more than eight search results", () => {
    expect(getMockLocations()).toHaveLength(10);
    expect(getMockLocations({ region: "부산" }).every((item) => item.region === "부산")).toBe(true);
    expect(getMockLocation("missing")).toBeNull();
    expect(searchMockLocations(Array(512).fill(0))).toHaveLength(8);
  });

  it("returns locations in a deterministic (name, then id) order", () => {
    const names = getMockLocations().map((location) => location.name);
    const sorted = [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(names).toEqual(sorted);
  });

  it("search: a region filter excludes a higher-similarity out-of-region hit instead of dropping it silently after the fact", () => {
    // phase = 8 with this embedding[0] -> the globally top-scoring fixture
    // (fixture 3, region 부산) is deliberately NOT in region 서울. If
    // filtering happened only via groupImageMatches's eligibleLocationIds
    // (the pre-RPC-filter behavior this mirrors), an implementation bug
    // could still let it leak through; filtering the candidate list before
    // grouping (matching the SQL filter_region behavior) must not do that.
    const embedding = Array(512).fill(0);
    embedding[0] = 0.008;
    const unfiltered = searchMockLocations(embedding);
    expect(unfiltered[0]?.location.region).toBe("부산");

    const filtered = searchMockLocations(embedding, { region: "서울" });
    expect(filtered.every((result) => result.location.region === "서울")).toBe(true);
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

  it("distinguishes on-site parking from nearby parking fixtures", () => {
    const onSite = getMockLocation(fixtureId(1));
    const nearby = getMockLocation(fixtureId(2));

    expect(onSite?.parking[0].locationId).toBe(onSite?.id);
    expect(onSite?.parking[0].point).toEqual(onSite?.point);
    expect(nearby?.parking[0].locationId).toBeNull();
    expect(nearby?.parking[0].point).not.toEqual(nearby?.point);
  });
});
