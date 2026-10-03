import { describe, expect, it } from "vitest";
import { mockLocations } from "@/domains/locations/fixtures/locations";
import { rankSimilarLocations } from "./similar-locations";

// Fixture ids are fixed UUIDs (src/domains/locations/fixtures/locations.ts),
// not "demo-0N" strings -- fixtureId(1) is demo-01, fixtureId(2) is demo-02,
// and so on in seed order (see mock-repository.test.ts for the same helper).
function fixtureId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

describe("similar location ranking", () => {
  it("excludes the selected location, deduplicates candidates, and applies Top K", () => {
    const results = rankSimilarLocations(fixtureId(1), [
      { locationId: fixtureId(1), locationImageId: "source", similarity: 1 },
      { locationId: fixtureId(2), locationImageId: "image-2a", similarity: 0.7 },
      { locationId: fixtureId(2), locationImageId: "image-2b", similarity: 0.9 },
      { locationId: fixtureId(3), locationImageId: "image-3", similarity: 0.8 },
    ], mockLocations, 1);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      location: { id: fixtureId(2) },
      matchedImageId: "image-2b",
      similarity: 0.9,
    });
  });

  it("handles unknown locations, missing embeddings, and orphan matches", () => {
    expect(rankSimilarLocations("unknown", [
      { locationId: fixtureId(2), locationImageId: "image-2", similarity: 0.9 },
    ], mockLocations)).toEqual([]);
    expect(rankSimilarLocations(fixtureId(1), [], mockLocations)).toEqual([]);
    expect(rankSimilarLocations(fixtureId(1), [
      { locationId: "missing", locationImageId: "orphan", similarity: 0.99 },
    ], mockLocations)).toEqual([]);
  });

  it("uses deterministic location and image tie-breaking", () => {
    const matches = [
      { locationId: fixtureId(3), locationImageId: "z", similarity: 0.8 },
      { locationId: fixtureId(2), locationImageId: "b", similarity: 0.8 },
      { locationId: fixtureId(2), locationImageId: "a", similarity: 0.8 },
    ];
    const expected = [[fixtureId(2), "a"], [fixtureId(3), "z"]];
    expect(rankSimilarLocations(fixtureId(1), matches, mockLocations)
      .map((result) => [result.location.id, result.matchedImageId])).toEqual(expected);
    expect(rankSimilarLocations(fixtureId(1), [...matches].reverse(), mockLocations)
      .map((result) => [result.location.id, result.matchedImageId])).toEqual(expected);
  });
});
