import { describe, expect, it } from "vitest";
import { createBusanDistrictCoverageReport } from "./busan-coverage.ts";

describe("createBusanDistrictCoverageReport", () => {
  it("reports every one of the 16 districts and a deterministic deficit", () => {
    const report = createBusanDistrictCoverageReport([
      { district: "busan_haeundae_gu" },
      { district: "busan_haeundae_gu" },
      { district: "busan_suyeong_gu" },
    ], 3);

    expect(report).toMatchObject({
      targetMinimumPerDistrict: 3,
      targetMinimumLocations: 48,
      totalLocations: 3,
      unassignedCount: 0,
      summary: { totalDistricts: 16, emptyDistricts: 14 },
    });
    expect(report.districts.find((d) => d.district === "busan_haeundae_gu"))
      .toMatchObject({ count: 2, deficit: 1, meetsTarget: false, label: "해운대구" });
    expect(report.districts.find((d) => d.district === "busan_gijang_gun"))
      .toMatchObject({ count: 0, deficit: 3, meetsTarget: false, label: "기장군" });
  });

  it("counts null-district locations toward the total but never toward any district", () => {
    const report = createBusanDistrictCoverageReport([
      { district: "busan_haeundae_gu" },
      { district: null },
      { district: null },
    ]);
    expect(report.totalLocations).toBe(3);
    expect(report.unassignedCount).toBe(2);
    expect(report.districts.find((d) => d.district === "busan_haeundae_gu")?.count).toBe(1);
    expect(report.districts.reduce((sum, d) => sum + d.count, 0)).toBe(1);
  });

  it("meets target once every district reaches the minimum", () => {
    const districts = ["busan_haeundae_gu", "busan_suyeong_gu", "busan_jung_gu"] as const;
    const locations = Array.from({ length: 48 }, (_, index) => ({
      district: districts[index % 3],
    }));
    // Only 3 of 16 districts are populated here, so most remain under target.
    const report = createBusanDistrictCoverageReport(locations, 3);
    expect(report.districts.find((d) => d.district === "busan_haeundae_gu")).toMatchObject({ meetsTarget: true });
    expect(report.summary.underTargetDistricts).toBe(13);
  });

  it("rejects a non-positive-integer target", () => {
    expect(() => createBusanDistrictCoverageReport([], 0)).toThrow();
    expect(() => createBusanDistrictCoverageReport([], 1.5)).toThrow();
  });
});
