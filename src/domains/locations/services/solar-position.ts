import SunCalc from "suncalc";
import type { GeoPoint, SolarPosition } from "@/types/domain";

const DEGREES_PER_RADIAN = 180 / Math.PI;
const FULL_CIRCLE_DEGREES = 360;

export function radiansToDegrees(radians: number): number {
  return radians * DEGREES_PER_RADIAN;
}

/**
 * Converts SunCalc azimuth radians to clockwise compass degrees.
 *
 * SunCalc uses 0 for south, negative values toward east, and positive values
 * toward west. SceneScan returns 0° north, 90° east, 180° south, and 270° west.
 */
export function sunCalcAzimuthToCompassDegrees(azimuthRadians: number): number {
  const degreesFromNorth = radiansToDegrees(azimuthRadians) + 180;
  return ((degreesFromNorth % FULL_CIRCLE_DEGREES) + FULL_CIRCLE_DEGREES) % FULL_CIRCLE_DEGREES;
}

function validateInput(point: GeoPoint, date: Date): void {
  if (!Number.isFinite(point.latitude) || point.latitude < -90 || point.latitude > 90) {
    throw new RangeError("Latitude must be a finite number between -90 and 90 degrees");
  }
  if (!Number.isFinite(point.longitude) || point.longitude < -180 || point.longitude > 180) {
    throw new RangeError("Longitude must be a finite number between -180 and 180 degrees");
  }
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    throw new RangeError("Date must be a valid JavaScript Date");
  }
}

/**
 * Returns the sun position for a geographic point and instant.
 *
 * Azimuth is clockwise compass degrees in [0, 360): 0° north, 90° east,
 * 180° south, and 270° west. Altitude is degrees relative to the geometric
 * horizon: positive above, 0° on, and negative below the horizon.
 */
export function getSolarPosition(point: GeoPoint, date: Date): SolarPosition {
  validateInput(point, date);
  const position = SunCalc.getPosition(date, point.latitude, point.longitude);
  const altitudeDegrees = radiansToDegrees(position.altitude);
  return {
    azimuthDegrees: sunCalcAzimuthToCompassDegrees(position.azimuth),
    altitudeDegrees,
    isAboveHorizon: position.altitude > 0,
  };
}
