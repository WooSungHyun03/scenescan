import { toKmaGrid } from "@/infrastructure/weather/kma-grid";
import type { GeoPoint } from "@/types/domain";
import type { WeatherGridPoint } from "@/types/weather";

export type WeatherGridLocation = {
  id: string;
  point: GeoPoint;
};

export type WeatherGridGroup = {
  key: string;
  grid: WeatherGridPoint;
  representativeLocationId: string;
  locationIds: string[];
};

export function getWeatherGridKey(grid: WeatherGridPoint): string {
  return `${grid.x}:${grid.y}`;
}

/** Groups compared locations before HTTP calls so one KMA grid is requested once. */
export function groupLocationsByWeatherGrid(locations: WeatherGridLocation[]): {
  groups: WeatherGridGroup[];
  gridKeyByLocationId: Map<string, string>;
  unavailableLocationIds: Set<string>;
} {
  const groupsByKey = new Map<string, WeatherGridGroup>();
  const gridKeyByLocationId = new Map<string, string>();
  const unavailableLocationIds = new Set<string>();

  for (const location of locations) {
    const grid = toKmaGrid(location.point);
    if (!grid) {
      unavailableLocationIds.add(location.id);
      continue;
    }
    const key = getWeatherGridKey(grid);
    gridKeyByLocationId.set(location.id, key);
    const group = groupsByKey.get(key);
    if (group) group.locationIds.push(location.id);
    else {
      groupsByKey.set(key, {
        key,
        grid,
        representativeLocationId: location.id,
        locationIds: [location.id],
      });
    }
  }

  return {
    groups: [...groupsByKey.values()],
    gridKeyByLocationId,
    unavailableLocationIds,
  };
}
