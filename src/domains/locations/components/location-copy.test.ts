import { describe, expect, it } from "vitest";
import { getKoreanDescription, getLocationAreaLabel } from "./location-copy";

describe("location description presentation", () => {
  it("preserves Korean and mixed-language source descriptions", () => {
    expect(getKoreanDescription("  서울의 LG 본사  ", "안내")).toBe("서울의 LG 본사");
  });
  it("uses honest guidance instead of inventing a translation", () => {
    expect(getKoreanDescription("temple", "위치와 촬영 조건을 확인하세요.")).toBe("위치와 촬영 조건을 확인하세요.");
  });
  it("handles empty descriptions", () => {
    expect(getKoreanDescription("  ", "설명 확인 필요")).toBe("설명 확인 필요");
  });
});

describe("getLocationAreaLabel", () => {
  it("combines the fixed region with the district label", () => {
    expect(getLocationAreaLabel("busan_haeundae_gu")).toBe("부산 해운대구");
  });
  it("falls back to the region alone for an unconfirmed district, never guessing one", () => {
    expect(getLocationAreaLabel(null)).toBe("부산");
  });
});
