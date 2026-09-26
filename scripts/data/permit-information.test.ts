import { describe, expect, it } from "vitest";
import {
  isPermitGuidance,
  mapPermitGuidance,
  PERMIT_GUIDANCE_VALUES,
} from "./permit-information.ts";

describe("permit information safety policy", () => {
  it("exposes only non-decisive canonical guidance", () => {
    expect(PERMIT_GUIDANCE_VALUES).toEqual([
      "문의 필요",
      "정보 확인 필요",
      "영상위원회 문의",
      "기관 직접 문의",
    ]);
    expect(PERMIT_GUIDANCE_VALUES.every(isPermitGuidance)).toBe(true);
  });

  it("uses an explicit source mapping without inferring legal permission", () => {
    expect(mapPermitGuidance(" Film_Commission ", {
      film_commission: "영상위원회 문의",
    }, "문의 필요")).toBe("영상위원회 문의");
    expect(mapPermitGuidance("기관 직접 문의", {}, "문의 필요")).toBe("기관 직접 문의");
  });

  it("uses safe guidance when the source has no permit status", () => {
    expect(mapPermitGuidance(undefined, {}, "문의 필요")).toBe("문의 필요");
    expect(mapPermitGuidance("  ", {}, "정보 확인 필요")).toBe("정보 확인 필요");
  });

  it.each([true, false])("rejects boolean permission value %s", (value) => {
    expect(() => mapPermitGuidance(value, {}, "문의 필요"))
      .toThrow("must not use an allowed/not-allowed boolean");
  });

  it.each(["허가 가능", "허가 불가능", "예약 가능"])("rejects unreviewed decision text %s", (value) => {
    expect(() => mapPermitGuidance(value, {}, "문의 필요"))
      .toThrow("add an explicit permitTypeMap entry after source review");
  });
});
