import { describe, expect, it } from "vitest";
import type { BusanBoundaryData } from "./busan-boundary.ts";
import { judgeBusanDistrict } from "./resolve-busan-districts.ts";

function syntheticBoundaries(): BusanBoundaryData {
  return {
    features: [
      {
        admName: "테스트 해운대동",
        district: "busan_haeundae_gu",
        polygons: [[[
          [129.00, 35.10], [129.00, 35.11], [129.01, 35.11], [129.01, 35.10], [129.00, 35.10],
        ]]],
      },
      {
        admName: "테스트 수영동",
        district: "busan_suyeong_gu",
        polygons: [[[
          [129.01, 35.10], [129.01, 35.11], [129.02, 35.11], [129.02, 35.10], [129.01, 35.10],
        ]]],
      },
    ],
  };
}

describe("judgeBusanDistrict", () => {
  it("confirms a district when the coordinate resolves clearly and the name agrees", () => {
    const judgement = judgeBusanDistrict(
      { id: "loc-1", name: "해운대 전망대", description: "해운대구의 명소", latitude: 35.103, longitude: 129.003 },
      syntheticBoundaries(),
    );
    expect(judgement).toMatchObject({ status: "confirmed", district: "busan_haeundae_gu" });
  });

  it("confirms when the name mentions no district at all, not just when it agrees", () => {
    const judgement = judgeBusanDistrict(
      { id: "loc-2", name: "바닷가 전망대", description: "경치가 좋은 곳", latitude: 35.103, longitude: 129.003 },
      syntheticBoundaries(),
    );
    expect(judgement).toMatchObject({ status: "confirmed", district: "busan_haeundae_gu" });
  });

  it("flags NAME_MISMATCH and leaves district unconfirmed when the name names a different district", () => {
    const judgement = judgeBusanDistrict(
      { id: "loc-3", name: "수영구 전망대", description: "설명", latitude: 35.103, longitude: 129.003 },
      syntheticBoundaries(),
    );
    expect(judgement).toEqual({
      id: "loc-3", name: "수영구 전망대", status: "needs-review", reason: "NAME_MISMATCH",
      boundaryDistrict: "busan_haeundae_gu", namedDistricts: ["busan_suyeong_gu"],
    });
  });

  it("flags NEAR_DISTRICT_BOUNDARY and leaves district unconfirmed near a shared edge", () => {
    const judgement = judgeBusanDistrict(
      { id: "loc-4", name: "경계 지점", description: "설명", latitude: 35.105, longitude: 129.0099 },
      syntheticBoundaries(),
    );
    expect(judgement.status).toBe("needs-review");
    expect(judgement).toMatchObject({ reason: "NEAR_DISTRICT_BOUNDARY" });
  });

  it("flags NOT_IN_ANY_DISTRICT_BOUNDARY for a coordinate outside every district", () => {
    const judgement = judgeBusanDistrict(
      { id: "loc-5", name: "먼 곳", description: "설명", latitude: 36.0, longitude: 130.5 },
      syntheticBoundaries(),
    );
    expect(judgement).toEqual({ id: "loc-5", name: "먼 곳", status: "needs-review", reason: "NOT_IN_ANY_DISTRICT_BOUNDARY" });
  });
});
