import { describe, expect, it } from "vitest";
import { mockLocations } from "@/mocks/locations";
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
});
