import type { GeoPoint } from "@/types/domain";
import type { WeatherGridPoint } from "@/types/weather";

// Lambert Conformal Conic constants published in the KMA village forecast
// conversion reference. The grid is 5 km and uses (43, 136) as its origin.
const EARTH_RADIUS_KM = 6371.00877;
const GRID_KM = 5;
const STANDARD_LATITUDE_1 = 30;
const STANDARD_LATITUDE_2 = 60;
const ORIGIN_LONGITUDE = 126;
const ORIGIN_LATITUDE = 38;
const ORIGIN_X = 43;
const ORIGIN_Y = 136;
const DEGREES_TO_RADIANS = Math.PI / 180;

export const KMA_GRID_BOUNDS = Object.freeze({
  minimumX: 1,
  maximumX: 149,
  minimumY: 1,
  maximumY: 253,
});

export function isKmaGridPoint(point: WeatherGridPoint): boolean {
  return Number.isInteger(point.x)
    && Number.isInteger(point.y)
    && point.x >= KMA_GRID_BOUNDS.minimumX
    && point.x <= KMA_GRID_BOUNDS.maximumX
    && point.y >= KMA_GRID_BOUNDS.minimumY
    && point.y <= KMA_GRID_BOUNDS.maximumY;
}

/** Convert WGS84 latitude/longitude to the official KMA 5 km forecast grid. */
export function toKmaGrid(point: GeoPoint): WeatherGridPoint | null {
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) return null;
  if (Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) return null;

  const radius = EARTH_RADIUS_KM / GRID_KM;
  const standardLatitude1 = STANDARD_LATITUDE_1 * DEGREES_TO_RADIANS;
  const standardLatitude2 = STANDARD_LATITUDE_2 * DEGREES_TO_RADIANS;
  const originLongitude = ORIGIN_LONGITUDE * DEGREES_TO_RADIANS;
  const originLatitude = ORIGIN_LATITUDE * DEGREES_TO_RADIANS;

  let sn = Math.tan(Math.PI * 0.25 + standardLatitude2 * 0.5)
    / Math.tan(Math.PI * 0.25 + standardLatitude1 * 0.5);
  sn = Math.log(Math.cos(standardLatitude1) / Math.cos(standardLatitude2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + standardLatitude1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(standardLatitude1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + originLatitude * 0.5);
  ro = (radius * sf) / Math.pow(ro, sn);

  let ra = Math.tan(
    Math.PI * 0.25 + point.latitude * DEGREES_TO_RADIANS * 0.5,
  );
  ra = (radius * sf) / Math.pow(ra, sn);
  let theta = point.longitude * DEGREES_TO_RADIANS - originLongitude;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;

  const grid = {
    x: Math.floor(ra * Math.sin(theta) + ORIGIN_X + 0.5),
    y: Math.floor(ro - ra * Math.cos(theta) + ORIGIN_Y + 0.5),
  };
  return isKmaGridPoint(grid) ? grid : null;
}
