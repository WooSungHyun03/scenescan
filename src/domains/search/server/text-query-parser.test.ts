import { describe, expect, it } from "vitest";
import { parseTextSearchQuery } from "./text-query-parser";

describe("parseTextSearchQuery", () => {
  it("resolves a district alias and leaves the remaining text as a keyword", () => {
    const result = parseTextSearchQuery("해운대 맛집");
    expect(result.district).toBe("busan_haeundae_gu");
    expect(result.outOfScope).toBe(false);
    expect(result.districtConflict).toBe(false);
    expect(result.keywords).toContain("맛집");
  });

  it("resolves a neighborhood alias that doesn't literally match a district label", () => {
    expect(parseTextSearchQuery("광안리 사진").district).toBe("busan_suyeong_gu");
    expect(parseTextSearchQuery("서면 느낌").district).toBe("busan_busanjin_gu");
  });

  it("resolves a district's full label the same as its short form", () => {
    expect(parseTextSearchQuery("영도구 바다").district).toBe("busan_yeongdo_gu");
    expect(parseTextSearchQuery("영도 바다").district).toBe("busan_yeongdo_gu");
  });

  it("does not mistake the 대구 substring in 해운대구 for another region", () => {
    const result = parseTextSearchQuery("해운대구 카페");
    expect(result.outOfScope).toBe(false);
    expect(result.district).toBe("busan_haeundae_gu");
    expect(result.keywords).toContain("카페");
    expect(parseTextSearchQuery("대구에서 해운대구 느낌 나는 곳").outOfScope).toBe(true);
    expect(parseTextSearchQuery("서울 해운대구 카페").outOfScope).toBe(true);
  });

  it("flags a district conflict instead of guessing one, when two districts are named", () => {
    const result = parseTextSearchQuery("해운대랑 서면 사진");
    expect(result.districtConflict).toBe(true);
    expect(result.district).toBeNull();
    expect(result.conflictingDistricts.sort()).toEqual(["busan_busanjin_gu", "busan_haeundae_gu"]);
  });

  it("keeps 경기장 as a venue keyword without treating it as 경기 province", () => {
    const result = parseTextSearchQuery("부산아시아드주경기장");
    expect(result.outOfScope).toBe(false);
    expect(result.district).toBeNull();
    expect(result.keywords).toContain("부산아시아드주경기장");
    expect(parseTextSearchQuery("기장군 경기장")).toMatchObject({ district: "busan_gijang_gun", keywords: ["경기장"], outOfScope: false });
    expect(parseTextSearchQuery("경기에서 경기장 찾아줘").outOfScope).toBe(true);
    expect(parseTextSearchQuery("서울 경기장").outOfScope).toBe(true);
  });

  it("does not flag a conflict for the same district mentioned via two different aliases", () => {
    const result = parseTextSearchQuery("해운대 센텀시티");
    expect(result.districtConflict).toBe(false);
    expect(result.district).toBe("busan_haeundae_gu");
  });

  it("resolves a category alias", () => {
    expect(parseTextSearchQuery("조용한 자연 풍경").category).toBe("nature");
    expect(parseTextSearchQuery("실내 스튜디오").category).toBe("interior");
  });

  it("flags an out-of-Busan region request and short-circuits everything else", () => {
    const result = parseTextSearchQuery("서울 카페");
    expect(result.outOfScope).toBe(true);
    expect(result.district).toBeNull();
    expect(result.category).toBeNull();
    expect(result.keywords).toEqual([]);
    expect(result.unsupportedConditions).toEqual([]);
  });

  it("treats a mixed Busan+other-region mention as out-of-scope rather than guessing intent", () => {
    expect(parseTextSearchQuery("서울에서 해운대 느낌 나는 곳").outOfScope).toBe(true);
  });

  it("extracts unsupported-condition phrases without using them as keywords or filters", () => {
    const result = parseTextSearchQuery("조용한 해운대 카페");
    expect(result.unsupportedConditions).toContain("조용한");
    expect(result.district).toBe("busan_haeundae_gu");
    expect(result.keywords).not.toContain("조용한");
    expect(result.keywords).toContain("카페");
  });

  it("extracts multiple unsupported-condition phrases", () => {
    const result = parseTextSearchQuery("촬영 가능하고 조용한 곳");
    expect(result.unsupportedConditions).toEqual(expect.arrayContaining(["촬영 가능", "조용한"]));
  });

  it("drops Korean particle stopwords from the keyword list", () => {
    const result = parseTextSearchQuery("바다가 보이는 곳을 찾아줘");
    expect(result.keywords).not.toContain("을");
    expect(result.keywords).not.toContain("곳");
    expect(result.keywords).not.toContain("찾아줘");
  });

  it("handles special characters, SQL metacharacters, and emoji without throwing", () => {
    expect(() => parseTextSearchQuery("';DROP TABLE locations;-- 🌊해운대")).not.toThrow();
    const result = parseTextSearchQuery("';DROP TABLE locations;-- 🌊해운대");
    expect(result.district).toBe("busan_haeundae_gu");
    expect(Array.isArray(result.keywords)).toBe(true);
  });

  it("treats a blank/whitespace-only query as zero keywords without throwing", () => {
    expect(() => parseTextSearchQuery("   ")).not.toThrow();
    expect(parseTextSearchQuery("   ").keywords).toEqual([]);
  });

  it("returns no filters and only free-text keywords for a query naming no district/category", () => {
    const result = parseTextSearchQuery("노을 지는 골목");
    expect(result.district).toBeNull();
    expect(result.category).toBeNull();
    expect(result.keywords.length).toBeGreaterThan(0);
  });
});
