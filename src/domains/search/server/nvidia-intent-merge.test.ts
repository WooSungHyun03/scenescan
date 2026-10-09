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
  it("keeps the base parser's district/category and never lets NVIDIA override an already-found value", () => {
    const merged = applyNvidiaIntentOverride(
      base({ district: "busan_haeundae_gu", category: "urban" }),
      { district: "busan_suyeong_gu", category: "nature", keywords: [], unsupportedConditions: [] },
    );
    expect(merged.district).toBe("busan_haeundae_gu");
    expect(merged.category).toBe("urban");
  });

  it("fills district/category only when the base parser left them null", () => {
    const merged = applyNvidiaIntentOverride(
      base({ district: null, category: null }),
      { district: "busan_haeundae_gu", category: "urban", keywords: [], unsupportedConditions: [] },
    );
    expect(merged.district).toBe("busan_haeundae_gu");
    expect(merged.category).toBe("urban");
  });

  it("fills only the null slot when one of district/category is already known", () => {
    const merged = applyNvidiaIntentOverride(
      base({ district: "busan_haeundae_gu", category: null }),
      { district: "busan_suyeong_gu", category: "urban", keywords: [], unsupportedConditions: [] },
    );
    expect(merged.district).toBe("busan_haeundae_gu");
    expect(merged.category).toBe("urban");
  });

  it("keeps an in-query district conflict exactly as-is, regardless of what NVIDIA returns", () => {
    const merged = applyNvidiaIntentOverride(
      base({ district: null, districtConflict: true, conflictingDistricts: ["busan_haeundae_gu", "busan_suyeong_gu"] }),
      { district: "busan_haeundae_gu", category: null, keywords: [], unsupportedConditions: [] },
    );
    expect(merged.district).toBeNull();
    expect(merged.districtConflict).toBe(true);
    expect(merged.conflictingDistricts).toEqual(["busan_haeundae_gu", "busan_suyeong_gu"]);
  });

  it("unions and deduplicates keywords instead of replacing them", () => {
    const merged = applyNvidiaIntentOverride(
      base({ keywords: ["야경", "카페"] }),
      { district: null, category: null, keywords: ["카페", "산책"], unsupportedConditions: [] },
    );
    expect(merged.keywords).toEqual(["야경", "카페", "산책"]);
  });

  it("unions and deduplicates unsupportedConditions, treating NVIDIA's additions the same as the base parser's own", () => {
    const merged = applyNvidiaIntentOverride(
      base({ unsupportedConditions: ["조용한"] }),
      { district: null, category: null, keywords: [], unsupportedConditions: ["조용한", "촬영 가능"] },
    );
    expect(merged.unsupportedConditions).toEqual(["조용한", "촬영 가능"]);
  });

  it("never touches outOfScope", () => {
    const merged = applyNvidiaIntentOverride(base({ outOfScope: false }), {
      district: null, category: null, keywords: [], unsupportedConditions: [],
    });
    expect(merged.outOfScope).toBe(false);
  });
});
