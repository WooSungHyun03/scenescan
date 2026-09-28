import { describe, expect, it } from "vitest";
import { mockLocations } from "@/domains/locations/fixtures/locations";
import { groupImageMatches } from "./group-image-matches";

// mockLocations[0]/[1]/[2].id -- fixture ids are fixed UUIDs
// (src/domains/locations/fixtures/locations.ts); referenced by value here
// rather than hardcoded strings so this test does not silently drift from
// the fixture file again.
const [FIRST_ID, SECOND_ID, THIRD_ID] = mockLocations.map((location) => location.id);

describe("groupImageMatches", () => {
  it("uses each location's strongest image and ranks locations", () => {
    const results = groupImageMatches([
      { locationId: FIRST_ID, locationImageId: "a", similarity: 0.3 },
      { locationId: SECOND_ID, locationImageId: "b", similarity: 0.7 },
      { locationId: FIRST_ID, locationImageId: "c", similarity: 0.9 },
    ], mockLocations);
    expect(results.map((item) => item.location.id)).toEqual([FIRST_ID, SECOND_ID]);
    expect(results[0].matchedImageId).toBe("c");
  });

  it("drops orphan and malformed matches and resolves ties deterministically", () => {
    const results = groupImageMatches([
      { locationId: SECOND_ID, locationImageId: "z", similarity: 0.8 },
      { locationId: FIRST_ID, locationImageId: "b", similarity: 0.8 },
      { locationId: FIRST_ID, locationImageId: "a", similarity: 0.8 },
      { locationId: "missing", locationImageId: "orphan", similarity: 1 },
      { locationId: THIRD_ID, locationImageId: "nan", similarity: Number.NaN },
    ], mockLocations);
    expect(results.map((item) => [item.location.id, item.matchedImageId])).toEqual([
      [FIRST_ID, "a"],
      [SECOND_ID, "z"],
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
