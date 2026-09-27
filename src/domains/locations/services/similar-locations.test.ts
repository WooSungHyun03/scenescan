import { describe, expect, it } from "vitest";
import { mockLocations } from "@/domains/locations/fixtures/locations";
import { rankSimilarLocations } from "./similar-locations";

describe("similar location ranking", () => {
  it("excludes the selected location, deduplicates candidates, and applies Top K", () => {
    const results = rankSimilarLocations("demo-01", [
      { locationId: "demo-01", locationImageId: "source", similarity: 1 },
      { locationId: "demo-02", locationImageId: "image-2a", similarity: 0.7 },
      { locationId: "demo-02", locationImageId: "image-2b", similarity: 0.9 },
      { locationId: "demo-03", locationImageId: "image-3", similarity: 0.8 },
    ], mockLocations, 1);

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      location: { id: "demo-02" },
      matchedImageId: "image-2b",
      similarity: 0.9,
    });
  });

  it("handles unknown locations, missing embeddings, and orphan matches", () => {
    expect(rankSimilarLocations("unknown", [
      { locationId: "demo-02", locationImageId: "image-2", similarity: 0.9 },
    ], mockLocations)).toEqual([]);
    expect(rankSimilarLocations("demo-01", [], mockLocations)).toEqual([]);
    expect(rankSimilarLocations("demo-01", [
      { locationId: "missing", locationImageId: "orphan", similarity: 0.99 },
    ], mockLocations)).toEqual([]);
  });

  it("uses deterministic location and image tie-breaking", () => {
    const matches = [
      { locationId: "demo-03", locationImageId: "z", similarity: 0.8 },
      { locationId: "demo-02", locationImageId: "b", similarity: 0.8 },
      { locationId: "demo-02", locationImageId: "a", similarity: 0.8 },
    ];
    const expected = [["demo-02", "a"], ["demo-03", "z"]];
    expect(rankSimilarLocations("demo-01", matches, mockLocations)
      .map((result) => [result.location.id, result.matchedImageId])).toEqual(expected);
    expect(rankSimilarLocations("demo-01", [...matches].reverse(), mockLocations)
      .map((result) => [result.location.id, result.matchedImageId])).toEqual(expected);
  });
});
