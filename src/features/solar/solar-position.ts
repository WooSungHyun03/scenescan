import SunCalc from "suncalc";
import type { GeoPoint, SolarPosition } from "@/types/domain";

export function getSolarPosition(point: GeoPoint, date: Date): SolarPosition {
  const position = SunCalc.getPosition(date, point.latitude, point.longitude);
  const altitudeDegrees = position.altitude * 180 / Math.PI;
  return {
    azimuthDegrees: ((position.azimuth * 180 / Math.PI) + 180 + 360) % 360,
    altitudeDegrees,
    isAboveHorizon: altitudeDegrees > 0,
  };
}
