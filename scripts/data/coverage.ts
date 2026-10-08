import type { LocationCategory } from "../../src/types/domain.ts";
import { LOCATION_CATEGORY_VALUES } from "../../src/types/location-options.ts";
import { KOREA_REGION_VALUES, type KoreaRegion } from "./contracts.ts";

export const MINIMUM_LOCATIONS_PER_CELL = 3;

export type CoverageLocation = {
  region: KoreaRegion;
  category: LocationCategory;
};

export type CoverageCell = {
  region: KoreaRegion;
  category: LocationCategory;
  count: number;
  target: number;
  deficit: number;
  meetsTarget: boolean;
};

export type CoverageReport = {
  schemaVersion: 1;
  targetMinimumPerCell: number;
  targetMinimumLocations: number;
  totalLocations: number;
  categoryTotals: Record<LocationCategory, number>;
  regionTotals: Record<KoreaRegion, number>;
  summary: {
    totalCells: number;
    cellsMeetingTarget: number;
    underTargetCells: number;
    emptyCells: number;
    totalDeficit: number;
  };
  cells: CoverageCell[];
};

export function coverageCellKey(region: KoreaRegion, category: LocationCategory): string {
  return `${region}\u0000${category}`;
}

export function createCoverageReport(
  locations: readonly CoverageLocation[],
  targetMinimumPerCell = MINIMUM_LOCATIONS_PER_CELL,
): CoverageReport {
  if (!Number.isInteger(targetMinimumPerCell) || targetMinimumPerCell < 1) {
    throw new Error("Coverage target must be a positive integer");
  }

  const categoryTotals = Object.fromEntries(
    LOCATION_CATEGORY_VALUES.map((category) => [category, 0]),
  ) as Record<LocationCategory, number>;
  const regionTotals = Object.fromEntries(
    KOREA_REGION_VALUES.map((region) => [region, 0]),
  ) as Record<KoreaRegion, number>;
  const counts = new Map<string, number>();

  for (const location of locations) {
    categoryTotals[location.category] += 1;
    regionTotals[location.region] += 1;
    const key = coverageCellKey(location.region, location.category);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const cells = KOREA_REGION_VALUES.flatMap((region) => LOCATION_CATEGORY_VALUES.map((category) => {
    const count = counts.get(coverageCellKey(region, category)) ?? 0;
    const deficit = Math.max(0, targetMinimumPerCell - count);
    return {
      region,
      category,
      count,
      target: targetMinimumPerCell,
      deficit,
      meetsTarget: deficit === 0,
    } satisfies CoverageCell;
  }));

  return {
    schemaVersion: 1,
    targetMinimumPerCell,
    targetMinimumLocations: KOREA_REGION_VALUES.length * LOCATION_CATEGORY_VALUES.length * targetMinimumPerCell,
    totalLocations: locations.length,
    categoryTotals,
    regionTotals,
    summary: {
      totalCells: cells.length,
      cellsMeetingTarget: cells.filter((cell) => cell.meetsTarget).length,
      underTargetCells: cells.filter((cell) => !cell.meetsTarget).length,
      emptyCells: cells.filter((cell) => cell.count === 0).length,
      totalDeficit: cells.reduce((sum, cell) => sum + cell.deficit, 0),
    },
    cells,
  };
}
