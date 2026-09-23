import { describe, expect, it } from "vitest";
import { mockLocations } from "@/domains/locations/fixtures/locations";
import { groupImageMatches } from "./group-image-matches";

describe("groupImageMatches", () => {
  it("uses each location's strongest image and ranks locations", () => {
    const results = groupImageMatches([
      { locationId: "demo-01", locationImageId: "a", similarity: 0.3 },
      { locationId: "demo-02", locationImageId: "b", similarity: 0.7 },
      { locationId: "demo-01", locationImageId: "c", similarity: 0.9 },
    ], mockLocations);
    expect(results.map((item) => item.location.id)).toEqual(["demo-01", "demo-02"]);
    expect(results[0].matchedImageId).toBe("c");
  });

  it("drops orphan and malformed matches and resolves ties deterministically", () => {
    const results = groupImageMatches([
      { locationId: "demo-02", locationImageId: "z", similarity: 0.8 },
      { locationId: "demo-01", locationImageId: "b", similarity: 0.8 },
      { locationId: "demo-01", locationImageId: "a", similarity: 0.8 },
      { locationId: "missing", locationImageId: "orphan", similarity: 1 },
      { locationId: "demo-03", locationImageId: "nan", similarity: Number.NaN },
    ], mockLocations);
    expect(results.map((item) => [item.location.id, item.matchedImageId])).toEqual([
      ["demo-01", "a"],
      ["demo-02", "z"],
    ]);
  });

  it("enforces the requested result limit and handles no eligible matches", () => {
    const matches = mockLocations.map((location, index) => ({
      locationId: location.id,
      locationImageId: location.images[0].id,
      similarity: 1 - index * 0.01,
    }));
    expect(groupImageMatches(matches, mockLocations)).toHaveLength(8);
    expect(groupImageMatches(matches, [], 8)).toEqual([]);
  });
});
