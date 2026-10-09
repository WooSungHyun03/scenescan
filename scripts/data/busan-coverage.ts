import type { District } from "../../src/types/domain.ts";
import { DISTRICT_LABELS, DISTRICT_VALUES } from "../../src/types/location-options.ts";

// Requirement 1: "coverage를 부산 16개 구·군 기준으로 바꾼다(1차 단일
// 정의 사용)" -- a Busan-district-level counterpart to coverage.ts's
// nationwide region x category cells (coverage.ts is unchanged and still
// used for the nationwide discovery pipeline elsewhere; this module is
// additive, specific to this ticket's Busan expansion rounds). Target is
// per-district only (requirement 5's reference goal: "16개 구·군 각 최소
// 3곳"), not crossed with category -- a simpler, coarser target than the
// nationwide region x category grid.
export const BUSAN_DISTRICT_MINIMUM_TARGET = 3;

export type BusanCoverageLocation = {
  district: District | null;
};

export type BusanDistrictCoverageCell = {
  district: District;
  label: string;
  count: number;
  target: number;
  deficit: number;
  meetsTarget: boolean;
};

export type BusanDistrictCoverageReport = {
  schemaVersion: 1;
  targetMinimumPerDistrict: number;
  targetMinimumLocations: number;
  totalLocations: number;
  // Locations with district === null -- unresolved/ambiguous, counted in
  // totalLocations but never attributed to any district's count (never
  // guessed; requirement 2).
  unassignedCount: number;
  summary: {
    totalDistricts: number;
    districtsMeetingTarget: number;
    underTargetDistricts: number;
    emptyDistricts: number;
    totalDeficit: number;
  };
  districts: BusanDistrictCoverageCell[];
};

export function createBusanDistrictCoverageReport(
  locations: readonly BusanCoverageLocation[],
  targetMinimumPerDistrict = BUSAN_DISTRICT_MINIMUM_TARGET,
): BusanDistrictCoverageReport {
  if (!Number.isInteger(targetMinimumPerDistrict) || targetMinimumPerDistrict < 1) {
    throw new Error("Busan district coverage target must be a positive integer");
  }

  const counts = new Map<District, number>(DISTRICT_VALUES.map((district) => [district, 0]));
  let unassignedCount = 0;
  for (const location of locations) {
    if (location.district === null) {
      unassignedCount += 1;
      continue;
    }
    counts.set(location.district, (counts.get(location.district) ?? 0) + 1);
  }

  const districts = DISTRICT_VALUES.map((district) => {
    const count = counts.get(district) ?? 0;
    const deficit = Math.max(0, targetMinimumPerDistrict - count);
    return {
      district,
      label: DISTRICT_LABELS[district],
      count,
      target: targetMinimumPerDistrict,
      deficit,
      meetsTarget: deficit === 0,
    } satisfies BusanDistrictCoverageCell;
  });

  return {
    schemaVersion: 1,
    targetMinimumPerDistrict,
    targetMinimumLocations: DISTRICT_VALUES.length * targetMinimumPerDistrict,
    totalLocations: locations.length,
    unassignedCount,
    summary: {
      totalDistricts: districts.length,
      districtsMeetingTarget: districts.filter((cell) => cell.meetsTarget).length,
      underTargetDistricts: districts.filter((cell) => !cell.meetsTarget).length,
      emptyDistricts: districts.filter((cell) => cell.count === 0).length,
      totalDeficit: districts.reduce((sum, cell) => sum + cell.deficit, 0),
    },
    districts,
  };
}
