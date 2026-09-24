import { describe, expect, it } from "vitest";
import {
  LOCATION_CATEGORY_TABLE,
  mapLocationCategory,
} from "./category-mapping.ts";

describe("mapLocationCategory", () => {
  it("maps only explicit common categories after stable key normalization", () => {
    expect(LOCATION_CATEGORY_TABLE).toEqual({
      urban: "urban",
      "도시": "urban",
      nature: "nature",
      "자연": "nature",
      industrial: "industrial",
      "산업": "industrial",
      interior: "interior",
      "실내": "interior",
    });
    expect(mapLocationCategory("  URBAN  ")).toMatchObject({
      status: "mapped",
      category: "urban",
      normalizedSourceCategory: "urban",
      matchedBy: "common-table",
    });
    expect(mapLocationCategory("실내")).toMatchObject({
      status: "mapped",
      category: "interior",
      matchedBy: "common-table",
    });
  });

  it("uses the source-specific table before the common table", () => {
    expect(mapLocationCategory(" City ", { city: "urban" })).toEqual({
      status: "mapped",
      sourceCategory: "City",
      normalizedSourceCategory: "city",
      category: "urban",
      matchedBy: "source-map",
    });
    expect(mapLocationCategory("nature", { nature: "urban" })).toMatchObject({
      status: "mapped",
      category: "urban",
      matchedBy: "source-map",
    });
  });

  it("sends unknown, missing, and invalid values to review without guessing", () => {
    expect(mapLocationCategory("urban park")).toEqual({
      status: "review",
      sourceCategory: "urban park",
      normalizedSourceCategory: "urban park",
      reason: "UNKNOWN_CATEGORY",
    });
    expect(mapLocationCategory("   ")).toMatchObject({ status: "review", reason: "MISSING_CATEGORY" });
    expect(mapLocationCategory({ type: "city" })).toMatchObject({ status: "review", reason: "INVALID_CATEGORY" });
  });

  it("rejects conflicting source keys after normalization", () => {
    expect(() => mapLocationCategory("city", { city: "urban", " CITY ": "nature" }))
      .toThrow('Conflicting category mappings for normalized source category "city"');
  });
});
