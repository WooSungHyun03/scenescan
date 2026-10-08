import { describe, expect, it } from "vitest";
import type { Location } from "@/types/domain";
import { buildMatchReasons, countMatchingKeywords, rankTextSearchHits } from "./text-search-ranking";

function fakeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: "loc-1",
    name: "테스트 장소",
    description: "설명",
    category: "urban",
    region: "부산",
    district: "busan_haeundae_gu",
    aliases: [],
    tags: [],
    address: "주소",
    point: { latitude: 0, longitude: 0 },
    images: [],
    permit: { type: "", contactName: null, contactPhone: null, note: null, source: null, sourceUrl: null, referenceDate: null, lastVerifiedAt: null },
    parking: [],
    source: null,
    sourceUrl: null,
    author: null,
    license: null,
    licenseUrl: null,
    lastVerifiedAt: null,
    ...overrides,
  };
}

describe("buildMatchReasons", () => {
  it("reports which field a keyword matched, for each of name/alias/description/tag", () => {
    const location = fakeLocation({
      name: "광안리 뷰 카페",
      aliases: ["광안대교 카페"],
      description: "야경이 좋은 곳",
      tags: ["바다"],
    });
    const reasons = buildMatchReasons(location, ["광안리", "야경", "바다"]);
    expect(reasons).toEqual(expect.arrayContaining([
      { field: "name", keyword: "광안리" },
      { field: "description", keyword: "야경" },
      { field: "tag", keyword: "바다" },
    ]));
  });

  it("can report a single keyword matching more than one field", () => {
    const location = fakeLocation({ name: "바다 전망대", tags: ["바다"] });
    const reasons = buildMatchReasons(location, ["바다"]);
    expect(reasons).toEqual(expect.arrayContaining([
      { field: "name", keyword: "바다" },
      { field: "tag", keyword: "바다" },
    ]));
  });

  it("is case-insensitive", () => {
    const location = fakeLocation({ name: "Haeundae Beach" });
    expect(buildMatchReasons(location, ["beach"])).toEqual([{ field: "name", keyword: "beach" }]);
  });

  it("returns no reasons for an empty keyword list -- never implies an unverified match", () => {
    expect(buildMatchReasons(fakeLocation(), [])).toEqual([]);
  });
});

describe("countMatchingKeywords", () => {
  it("counts a keyword once even when it matches multiple fields", () => {
    const location = fakeLocation({ name: "바다 전망대", tags: ["바다"] });
    expect(countMatchingKeywords(location, ["바다"])).toBe(1);
  });

  it("counts distinct keywords, not total field hits", () => {
    const location = fakeLocation({ name: "바다 전망대", description: "야경 명소" });
    expect(countMatchingKeywords(location, ["바다", "야경", "없는말"])).toBe(2);
  });

  it("ignores a blank keyword", () => {
    expect(countMatchingKeywords(fakeLocation({ name: "바다" }), ["   ", "바다"])).toBe(1);
  });
});

describe("rankTextSearchHits", () => {
  it("sorts by score descending, then location id ascending for ties (requirement 4)", () => {
    const locations = [
      fakeLocation({ id: "b", name: "장소 B" }),
      fakeLocation({ id: "a", name: "장소 A" }),
      fakeLocation({ id: "c", name: "장소 C" }),
    ];
    const hits = [
      { locationId: "b", score: 1 },
      { locationId: "a", score: 2 },
      { locationId: "c", score: 2 },
    ];
    const ranked = rankTextSearchHits(hits, locations, ["장소"]);
    expect(ranked.map((result) => result.location.id)).toEqual(["a", "c", "b"]);
  });

  it("respects the limit", () => {
    const locations = Array.from({ length: 10 }, (_, index) => fakeLocation({ id: `loc-${index}`, name: `장소 ${index}` }));
    const hits = locations.map((location, index) => ({ locationId: location.id, score: 10 - index }));
    expect(rankTextSearchHits(hits, locations, [], 8)).toHaveLength(8);
  });

  it("drops a hit whose location failed to hydrate instead of throwing", () => {
    const locations = [fakeLocation({ id: "known" })];
    const hits = [{ locationId: "known", score: 1 }, { locationId: "missing", score: 5 }];
    const ranked = rankTextSearchHits(hits, locations, []);
    expect(ranked.map((result) => result.location.id)).toEqual(["known"]);
  });

  it("attaches score and matchedOn to each result", () => {
    const locations = [fakeLocation({ id: "loc-1", name: "광안리 카페" })];
    const ranked = rankTextSearchHits([{ locationId: "loc-1", score: 1 }], locations, ["광안리"]);
    expect(ranked[0].score).toBe(1);
    expect(ranked[0].matchedOn).toEqual([{ field: "name", keyword: "광안리" }]);
  });
});
