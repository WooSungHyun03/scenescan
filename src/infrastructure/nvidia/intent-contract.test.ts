import { describe, expect, it } from "vitest";
import { parseNvidiaIntentResponse } from "./intent-contract";

describe("parseNvidiaIntentResponse", () => {
  it("accepts a fully populated, well-formed response", () => {
    expect(parseNvidiaIntentResponse({
      district: "busan_haeundae_gu",
      category: "urban",
      keywords: ["야경", "카페"],
      unsupportedConditions: ["조용한"],
    })).toEqual({
      district: "busan_haeundae_gu",
      category: "urban",
      keywords: ["야경", "카페"],
      unsupportedConditions: ["조용한"],
    });
  });

  it("defaults missing optional fields instead of failing", () => {
    expect(parseNvidiaIntentResponse({})).toEqual({
      district: null,
      category: null,
      keywords: [],
      unsupportedConditions: [],
    });
  });

  it("silently drops unknown extra fields rather than failing", () => {
    expect(parseNvidiaIntentResponse({
      district: null,
      category: null,
      keywords: ["해운대"],
      unsupportedConditions: [],
      confidence: 0.97,
      reasoning: "the user asked about Haeundae",
    })).toEqual({
      district: null,
      category: null,
      keywords: ["해운대"],
      unsupportedConditions: [],
    });
  });

  it("rejects a district value outside the 1차 single definition", () => {
    expect(parseNvidiaIntentResponse({ district: "서울", category: null, keywords: [], unsupportedConditions: [] }))
      .toBeNull();
  });

  it("rejects a category value outside the 1차 single definition", () => {
    expect(parseNvidiaIntentResponse({ district: null, category: "space", keywords: [], unsupportedConditions: [] }))
      .toBeNull();
  });

  it("rejects malformed shapes (wrong types, non-object, null)", () => {
    expect(parseNvidiaIntentResponse(null)).toBeNull();
    expect(parseNvidiaIntentResponse("해운대 맛집")).toBeNull();
    expect(parseNvidiaIntentResponse([])).toBeNull();
    expect(parseNvidiaIntentResponse({ district: "busan_haeundae_gu", category: null, keywords: "해운대", unsupportedConditions: [] }))
      .toBeNull();
  });

  it("rejects an oversized keyword/unsupportedConditions list rather than truncating silently", () => {
    const tooMany = Array.from({ length: 17 }, (_, index) => `키워드${index}`);
    expect(parseNvidiaIntentResponse({ district: null, category: null, keywords: tooMany, unsupportedConditions: [] }))
      .toBeNull();
  });
});
