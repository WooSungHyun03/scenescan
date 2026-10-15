import { describe, expect, it } from "vitest";
import { uniqueSearchKeywords } from "./search-keywords";

describe("uniqueSearchKeywords", () => {
  it("preserves first spelling and order without mutating input", () => {
    const input = Object.freeze([" Beach ", "BEACH", "골목", "beach", "골목", "  ", "야경"]);
    expect(uniqueSearchKeywords(input)).toEqual(["Beach", "골목", "야경"]);
    expect(input[0]).toBe(" Beach ");
  });
  it("does not conflate different Korean roots, accents or literal SQL wildcards", () => {
    expect(uniqueSearchKeywords(["바다", "바다가", "cafe", "café", "%", "_", "\\"]))
      .toEqual(["바다", "바다가", "cafe", "café", "%", "_", "\\"]);
  });
});
