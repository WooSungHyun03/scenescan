import type {
  GeoPoint,
  ParkingDistanceResult,
  ParkingInfo,
} from "@/types/domain";

const earthRadiusMeters = 6_371_000;

function isValidPoint(point: GeoPoint) {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

export function getStraightLineDistanceMeters(origin: GeoPoint, destination: GeoPoint) {
  if (!isValidPoint(origin) || !isValidPoint(destination)) return null;

  const latitudeDelta = toRadians(destination.latitude - origin.latitude);
  const longitudeDelta = toRadians(destination.longitude - origin.longitude);
  const originLatitude = toRadians(origin.latitude);
  const destinationLatitude = toRadians(destination.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(originLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  // Rounding at antipodal points can produce 1 + epsilon despite valid
  // WGS84 inputs; clamp only this mathematical [0, 1] intermediate.
  const boundedHaversine = Math.max(0, Math.min(1, haversine));
  const angularDistance =
    2 * Math.atan2(Math.sqrt(boundedHaversine), Math.sqrt(1 - boundedHaversine));
  return earthRadiusMeters * angularDistance;
}

/** One distance label shared by detail and comparison surfaces. */
export function formatStraightLineDistance(distanceMeters: number | null): string {
  if (distanceMeters === null || !Number.isFinite(distanceMeters) || distanceMeters < 0) return "거리 정보 없음";
  if (distanceMeters < 1_000) return `직선거리 ${Math.round(distanceMeters)}m`;
  return `직선거리 ${(distanceMeters / 1_000).toLocaleString("ko-KR", {
    maximumFractionDigits: 1,
  })}km`;
}

export function sortParkingByDistance(
  origin: GeoPoint,
  parking: ParkingInfo[],
): ParkingDistanceResult[] {
  return parking
    .map((item, index) => ({
      parking: item,
      distanceMeters: getStraightLineDistanceMeters(origin, item.point),
      index,
    }))
    .sort((left, right) => {
      if (left.distanceMeters === null && right.distanceMeters === null) {
        return left.index - right.index;
      }
      if (left.distanceMeters === null) return 1;
      if (right.distanceMeters === null) return -1;
      return left.distanceMeters - right.distanceMeters || left.index - right.index;
    })
    .map(({ parking: item, distanceMeters }) => ({
      parking: item,
      distanceMeters,
    }));
}
