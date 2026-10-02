import { describe, expect, it } from "vitest";
import { normalizeShortlistIds, parseShortlistIds } from "./shortlist-storage";

describe("shortlist storage", () => {
  it("keeps unique non-empty location IDs in their saved order", () => {
    expect(
      normalizeShortlistIds([" demo-02 ", "demo-01", "demo-02", "", 3]),
    ).toEqual(["demo-02", "demo-01"]);
  });

  it("recovers safely from missing or malformed local storage values", () => {
    expect(parseShortlistIds(null)).toEqual([]);
    expect(parseShortlistIds("not-json")).toEqual([]);
    expect(parseShortlistIds(JSON.stringify({ id: "demo-01" }))).toEqual([]);
  });
});
