import { describe, expect, it } from "vitest";
import type { ParsedTextSearchQuery } from "@/types/text-search";
import { resolveTextSearchFilters } from "./text-search-filter-resolution";

function parsedQuery(overrides: Partial<ParsedTextSearchQuery> = {}): ParsedTextSearchQuery {
  return {
    district: null,
    category: null,
    keywords: [],
    districtConflict: false,
    conflictingDistricts: [],
    outOfScope: false,
    unsupportedConditions: [],
    ...overrides,
  };
}

describe("resolveTextSearchFilters", () => {
  it("uses the filter when the query text named nothing", () => {
    const result = resolveTextSearchFilters(parsedQuery(), { district: "busan_haeundae_gu" });
    expect(result).toEqual({ district: "busan_haeundae_gu", category: null, notice: null });
  });

  it("uses the query text's district when no filter is given", () => {
    const result = resolveTextSearchFilters(parsedQuery({ district: "busan_haeundae_gu" }), {});
    expect(result).toEqual({ district: "busan_haeundae_gu", category: null, notice: null });
  });

  it("has no conflict notice when the filter and query text agree", () => {
    const result = resolveTextSearchFilters(parsedQuery({ district: "busan_haeundae_gu" }), { district: "busan_haeundae_gu" });
    expect(result).toEqual({ district: "busan_haeundae_gu", category: null, notice: null });
  });

  it("prefers the filter and reports a district conflict notice", () => {
    const result = resolveTextSearchFilters(parsedQuery({ district: "busan_haeundae_gu" }), { district: "busan_suyeong_gu" });
    expect(result.district).toBe("busan_suyeong_gu");
    expect(result.notice).toEqual({ code: "FILTER_OVERRIDES_QUERY", message: expect.stringContaining("지역") });
  });

  it("prefers the filter and reports a category conflict notice", () => {
    const result = resolveTextSearchFilters(parsedQuery({ category: "urban" }), { category: "nature" });
    expect(result.category).toBe("nature");
    expect(result.notice).toEqual({ code: "FILTER_OVERRIDES_QUERY", message: expect.stringContaining("공간 종류") });
  });

  it("reports both fields when district and category both conflict", () => {
    const result = resolveTextSearchFilters(parsedQuery({ district: "busan_haeundae_gu", category: "urban" }), { district: "busan_suyeong_gu", category: "nature" });
    expect(result).toEqual({
      district: "busan_suyeong_gu",
      category: "nature",
      notice: { code: "FILTER_OVERRIDES_QUERY", message: expect.stringContaining("지역·공간 종류") },
    });
  });

  it("does not treat an in-query district conflict (query district already null) as a filter override", () => {
    const result = resolveTextSearchFilters(parsedQuery({ district: null, districtConflict: true }), { district: "busan_haeundae_gu" });
    expect(result).toEqual({ district: "busan_haeundae_gu", category: null, notice: null });
  });
});
