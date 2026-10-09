import { describe, expect, it } from "vitest";
import type { ParsedTextSearchQuery } from "@/types/text-search";
import { applyNvidiaIntentOverride } from "./nvidia-intent-merge";

function base(overrides: Partial<ParsedTextSearchQuery> = {}): ParsedTextSearchQuery {
  return {
    district: null,
    category: null,
    keywords: ["원본"],
    districtConflict: false,
    conflictingDistricts: [],
    outOfScope: false,
    unsupportedConditions: [],
    ...overrides,
  };
}

describe("applyNvidiaIntentOverride", () => {
  it("replaces district/category/keywords/unsupportedConditions with NVIDIA's result", () => {
    const merged = applyNvidiaIntentOverride(base(), {
      district: "busan_haeundae_gu",
      category: "urban",
      keywords: ["야경"],
      unsupportedConditions: ["조용한"],
    });
    expect(merged).toMatchObject({
      district: "busan_haeundae_gu",
      category: "urban",
      keywords: ["야경"],
      unsupportedConditions: ["조용한"],
    });
  });

  it("clears a stale in-query district conflict once NVIDIA confidently names a district", () => {
    const merged = applyNvidiaIntentOverride(
      base({ district: null, districtConflict: true, conflictingDistricts: ["busan_haeundae_gu", "busan_suyeong_gu"] }),
      { district: "busan_haeundae_gu", category: null, keywords: [], unsupportedConditions: [] },
    );
    expect(merged.districtConflict).toBe(false);
    expect(merged.conflictingDistricts).toEqual([]);
    expect(merged.district).toBe("busan_haeundae_gu");
  });

  it("keeps the base parser's own conflict signal when NVIDIA also returns no district", () => {
    const merged = applyNvidiaIntentOverride(
      base({ district: null, districtConflict: true, conflictingDistricts: ["busan_haeundae_gu", "busan_suyeong_gu"] }),
      { district: null, category: null, keywords: [], unsupportedConditions: [] },
    );
    expect(merged.districtConflict).toBe(true);
    expect(merged.conflictingDistricts).toEqual(["busan_haeundae_gu", "busan_suyeong_gu"]);
  });

  it("never touches outOfScope", () => {
    const merged = applyNvidiaIntentOverride(base({ outOfScope: false }), {
      district: null, category: null, keywords: [], unsupportedConditions: [],
    });
    expect(merged.outOfScope).toBe(false);
  });
});
