import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadBusanDistrictBoundaries,
  resolveDistrictByBoundary,
  crossCheckNamedDistrict,
  type BusanBoundaryData,
} from "./busan-boundary.ts";

const REAL_BOUNDARY_PATH = resolve(import.meta.dirname, "../../data/production/boundaries/busan-admdong-2026-07-01.geojson");

// A polygon's own vertex average is not guaranteed to be inside a concave
// ring, so this picks the midpoint of the first ring's first two vertices
// instead -- guaranteed to lie exactly on that ring's boundary, which this
// module must flag as needs-review (NEAR_DISTRICT_BOUNDARY), proving the
// loader parsed real, usable geometry without asserting any specific
// real-world address (no hand-typed Busan coordinates here).
function pointOnFirstEdge(boundaries: BusanBoundaryData, admName: string): [number, number] {
  const feature = boundaries.features.find((f) => f.admName === admName);
  if (!feature) throw new Error(`fixture dong not found: ${admName}`);
  const [a, b] = feature.polygons[0][0];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

// Two adjacent ~1.1km-wide squares at a realistic Busan latitude (so the
// local-meters approximation the module uses is exercised at the right
// scale), sharing the boundary at longitude 129.01. Synthetic, not real
// district geometry -- these tests check the point-in-polygon/near-boundary
// ALGORITHM, not real-world accuracy (that's covered by the integration
// test against the real file below).
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

describe("resolveDistrictByBoundary", () => {
  it("resolves a point well inside a single district's polygon", () => {
    const result = resolveDistrictByBoundary([129.003, 35.103], syntheticBoundaries());
    expect(result).toMatchObject({ district: "busan_haeundae_gu", status: "resolved", reason: "BOUNDARY_CONTAINS_POINT" });
  });

  it("flags a point within 100m of the shared boundary for review instead of confirming", () => {
    // 129.0001 degrees of longitude at this latitude is roughly 9m -- well
    // inside the 100m guard band around the shared edge at 129.01.
    const result = resolveDistrictByBoundary([129.0099, 35.105], syntheticBoundaries());
    expect(result.status).toBe("needs-review");
    expect(result).toMatchObject({ district: null, reason: "NEAR_DISTRICT_BOUNDARY" });
    if (result.reason === "NEAR_DISTRICT_BOUNDARY") {
      expect(result.nearestDistricts).toEqual(expect.arrayContaining(["busan_haeundae_gu", "busan_suyeong_gu"]));
      expect(result.distanceToBoundaryMeters).toBeLessThan(100);
    }
  });

  it("resolves a point far enough from the shared boundary even though it is in the same general area", () => {
    const result = resolveDistrictByBoundary([129.015, 35.105], syntheticBoundaries());
    expect(result).toMatchObject({ district: "busan_suyeong_gu", status: "resolved" });
    if (result.status === "resolved") expect(result.distanceToBoundaryMeters).toBeGreaterThanOrEqual(100);
  });

  it("flags a point outside every district polygon (e.g. over water or outside Busan) for review, never guessing", () => {
    const result = resolveDistrictByBoundary([130.5, 36.0], syntheticBoundaries());
    expect(result).toEqual({ district: null, status: "needs-review", reason: "NOT_IN_ANY_DISTRICT_BOUNDARY" });
  });
});

describe("crossCheckNamedDistrict", () => {
  it("reports consistent when the name mentions the same district the boundary resolved", () => {
    expect(crossCheckNamedDistrict("해운대 달맞이길 전망대", "busan_haeundae_gu")).toEqual({ status: "consistent" });
  });

  it("reports consistent when the name mentions no district at all", () => {
    expect(crossCheckNamedDistrict("바닷가 전망대", "busan_haeundae_gu")).toEqual({ status: "consistent" });
  });

  it("reports a conflict when the name names a different district than the boundary resolved", () => {
    const result = crossCheckNamedDistrict("수영구 광안리 전망대", "busan_haeundae_gu");
    expect(result).toEqual({ status: "conflict", namedDistricts: ["busan_suyeong_gu"] });
  });

  it("never treats the 1-character short forms of 중/서/동/남/북구 as a name match", () => {
    expect(crossCheckNamedDistrict("동 전망대", "busan_haeundae_gu")).toEqual({ status: "consistent" });
  });

  it("never treats '경기장' (stadium) as naming 기장군 -- real round-1 false positive on 부산아시아드주경기장", () => {
    expect(crossCheckNamedDistrict("대한민국 부산광역시에 있는 부산아시아드주경기장 스포츠 시설", "busan_yeonje_gu"))
      .toEqual({ status: "consistent" });
  });
});

describe("loadBusanDistrictBoundaries (real reviewed boundary file)", () => {
  it("loads all 206 Busan administrative-dong features across exactly 16 districts", async () => {
    const data = await loadBusanDistrictBoundaries(REAL_BOUNDARY_PATH);
    expect(data.features).toHaveLength(206);
    expect(new Set(data.features.map((f) => f.district)).size).toBe(16);
  });

  it("flags a point sitting exactly on a real dong's own boundary edge as needs-review, not a confirmed district", async () => {
    const data = await loadBusanDistrictBoundaries(REAL_BOUNDARY_PATH);
    const point = pointOnFirstEdge(data, "부산광역시 중구 중앙동");
    const result = resolveDistrictByBoundary(point, data);
    expect(result.status).toBe("needs-review");
  });

  it("rejects a boundary file that is not a GeoJSON FeatureCollection", async () => {
    await expect(loadBusanDistrictBoundaries(resolve(import.meta.dirname, "./contracts.ts")))
      .rejects.toThrow();
  });
});
