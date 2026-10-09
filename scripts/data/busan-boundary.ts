import { readFile } from "node:fs/promises";
import type { District } from "../../src/types/domain.ts";
import { DISTRICT_LABELS } from "../../src/types/location-options.ts";

/**
 * Coordinate + official boundary based district judgement (ticket follow-up:
 * "district가 null인 부산 장소들을 좌표 + 공식 행정구역 경계 데이터로
 * 판정한다"). Boundary data source: see DATA_LICENSES.md's "Busan
 * administrative district boundaries" entry for the exact file, license
 * (CC BY 4.0, derived from Statistics Korea SGIS under KOGL Type 1), and
 * reference date -- this module only consumes the already-downloaded,
 * already-licensed GeoJSON at data/production/boundaries/.
 *
 * Point-in-polygon only ever runs against this reviewed boundary file; it
 * never calls an external API (no key, no network, no rate limit to manage).
 */

const DISTRICT_LABEL_TO_VALUE = new Map<string, District>(
  (Object.entries(DISTRICT_LABELS) as [District, string][]).map(([value, label]) => [label, value]),
);

type Position = [number, number];
type LinearRing = Position[];
type PolygonCoordinates = LinearRing[];
type MultiPolygonCoordinates = PolygonCoordinates[];

type BoundaryFeature = {
  admName: string;
  district: District;
  polygons: PolygonCoordinates[];
};

export type BusanBoundaryData = {
  features: BoundaryFeature[];
};

type RawGeoJsonFeature = {
  type: "Feature";
  properties: { adm_nm?: unknown; sggnm?: unknown };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
};

export async function loadBusanDistrictBoundaries(path: string): Promise<BusanBoundaryData> {
  const raw = JSON.parse(await readFile(path, "utf8")) as { type: "FeatureCollection"; features: RawGeoJsonFeature[] };
  if (raw.type !== "FeatureCollection" || !Array.isArray(raw.features)) {
    throw new Error("Boundary file is not a GeoJSON FeatureCollection");
  }
  const features: BoundaryFeature[] = raw.features.map((feature) => {
    const label = feature.properties.sggnm;
    const admName = feature.properties.adm_nm;
    if (typeof label !== "string" || typeof admName !== "string") {
      throw new Error("Boundary feature is missing adm_nm/sggnm properties");
    }
    const district = DISTRICT_LABEL_TO_VALUE.get(label);
    if (!district) throw new Error(`Boundary feature names an unrecognized district label: ${label}`);
    const polygons: PolygonCoordinates[] = feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates as PolygonCoordinates]
      : feature.geometry.coordinates as MultiPolygonCoordinates;
    return { admName, district, polygons };
  });
  return { features };
}

// Ray-casting point-in-ring test (standard even-odd rule). `point` and
// `ring` are both [longitude, latitude] pairs -- treated as plane
// coordinates, which is an adequate approximation at Busan's scale (a city
// roughly 40km across, far too small for geodesic distortion to flip a
// point-in-polygon result).
function pointInRing(point: Position, ring: LinearRing): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = (yi > point[1]) !== (yj > point[1])
      && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// GeoJSON Polygon convention: ring 0 is the exterior, any further rings are
// holes -- a point inside a hole is NOT inside the polygon.
function pointInPolygon(point: Position, polygon: PolygonCoordinates): boolean {
  if (polygon.length === 0 || !pointInRing(point, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i += 1) {
    if (pointInRing(point, polygon[i])) return false;
  }
  return true;
}

function pointInAnyPolygon(point: Position, polygons: PolygonCoordinates[]): boolean {
  return polygons.some((polygon) => pointInPolygon(point, polygon));
}

const EARTH_RADIUS_METERS = 6_371_000;

// Local equirectangular projection to meters, centered on `origin` --
// adequate for the <=100m-scale proximity check this module needs; not
// intended for long-distance geodesy.
function toLocalMeters(point: Position, origin: Position): { x: number; y: number } {
  const latitudeRadians = (origin[1] * Math.PI) / 180;
  const x = ((point[0] - origin[0]) * Math.PI) / 180 * EARTH_RADIUS_METERS * Math.cos(latitudeRadians);
  const y = ((point[1] - origin[1]) * Math.PI) / 180 * EARTH_RADIUS_METERS;
  return { x, y };
}

function pointToSegmentDistanceMeters(point: Position, a: Position, b: Position): number {
  const p = toLocalMeters(point, point);
  const pa = toLocalMeters(a, point);
  const pb = toLocalMeters(b, point);
  const abx = pb.x - pa.x;
  const aby = pb.y - pa.y;
  const lengthSquared = abx * abx + aby * aby;
  if (lengthSquared === 0) return Math.hypot(p.x - pa.x, p.y - pa.y);
  const t = Math.max(0, Math.min(1, ((p.x - pa.x) * abx + (p.y - pa.y) * aby) / lengthSquared));
  const closestX = pa.x + t * abx;
  const closestY = pa.y + t * aby;
  return Math.hypot(p.x - closestX, p.y - closestY);
}

function minimumDistanceToPolygonBoundary(point: Position, polygon: PolygonCoordinates): number {
  let minimum = Infinity;
  for (const ring of polygon) {
    for (let i = 0; i < ring.length - 1; i += 1) {
      minimum = Math.min(minimum, pointToSegmentDistanceMeters(point, ring[i], ring[i + 1]));
    }
  }
  return minimum;
}

export const BUSAN_BOUNDARY_PROXIMITY_THRESHOLD_METERS = 100;

export type BoundaryDistrictResolution =
  | { district: District; status: "resolved"; reason: "BOUNDARY_CONTAINS_POINT"; admName: string; distanceToBoundaryMeters: number }
  | { district: null; status: "needs-review"; reason: "NOT_IN_ANY_DISTRICT_BOUNDARY" }
  | { district: null; status: "needs-review"; reason: "NEAR_DISTRICT_BOUNDARY"; nearestDistricts: District[]; distanceToBoundaryMeters: number };

/**
 * Finds which Busan administrative-dong polygon contains `point`, then
 * reports that dong's district -- unless the point sits within
 * BUSAN_BOUNDARY_PROXIMITY_THRESHOLD_METERS of the matched polygon's own
 * boundary, in which case geocoding/source-coordinate imprecision could
 * put the true location in a neighboring district, so this returns
 * needs-review instead of confirming (requirement 2's border-proximity
 * rule). A point inside no polygon at all (outside Busan, or over water
 * between the coastline and a dong boundary) is also needs-review, never
 * assigned to the "closest" district by guesswork.
 */
export function resolveDistrictByBoundary(point: Position, boundaries: BusanBoundaryData): BoundaryDistrictResolution {
  const containing = boundaries.features.find((feature) => pointInAnyPolygon(point, feature.polygons));
  if (!containing) {
    return { district: null, status: "needs-review", reason: "NOT_IN_ANY_DISTRICT_BOUNDARY" };
  }
  const distanceToBoundaryMeters = Math.min(
    ...containing.polygons.map((polygon) => minimumDistanceToPolygonBoundary(point, polygon)),
  );
  if (distanceToBoundaryMeters < BUSAN_BOUNDARY_PROXIMITY_THRESHOLD_METERS) {
    const nearestDistricts = [...new Set(
      boundaries.features
        .filter((feature) => feature.polygons.some(
          (polygon) => minimumDistanceToPolygonBoundary(point, polygon) < BUSAN_BOUNDARY_PROXIMITY_THRESHOLD_METERS,
        ))
        .map((feature) => feature.district),
    )];
    return { district: null, status: "needs-review", reason: "NEAR_DISTRICT_BOUNDARY", nearestDistricts, distanceToBoundaryMeters };
  }
  return {
    district: containing.district,
    status: "resolved",
    reason: "BOUNDARY_CONTAINS_POINT",
    admName: containing.admName,
    distanceToBoundaryMeters,
  };
}

export type NameCrossCheckResult =
  | { status: "consistent" }
  | { status: "conflict"; namedDistricts: District[] };

/**
 * Requirement 2's second cross-check: a location's own name/description
 * naming a *different* district than the boundary judgement is a
 * disagreement worth a human looking at, even though the boundary data
 * itself is authoritative for the coordinate -- the coordinate could be
 * wrong, not just borderline. Reuses the same longest-alias-first,
 * 2-char-minimum-short-form matching as busan-district.ts (never matches
 * 중/서/동/남/북구's ambiguous 1-character short forms, and never matches
 * "기장" either -- that 2-character short form is also the tail of
 * "경기장" (stadium), a word that recurs constantly in facility
 * descriptions; found empirically on real round-1 data, see
 * busan-district.ts's AMBIGUOUS_SHORT_FORMS for the same exclusion).
 */
export function crossCheckNamedDistrict(text: string, boundaryDistrict: District): NameCrossCheckResult {
  let remaining = text;
  const matched: District[] = [];
  const ambiguousShortForms = new Set(["기장"]);
  const aliasesByLengthDescending = (Object.entries(DISTRICT_LABELS) as [District, string][])
    .flatMap(([district, label]) => {
      const shortForm = label.replace(/(구|군)$/u, "");
      const aliases = shortForm.length >= 2 && !ambiguousShortForms.has(shortForm) ? [label, shortForm] : [label];
      return aliases.map((alias) => ({ district, alias }));
    })
    .sort((a, b) => b.alias.length - a.alias.length);
  for (const { district, alias } of aliasesByLengthDescending) {
    if (!remaining.includes(alias)) continue;
    if (!matched.includes(district)) matched.push(district);
    remaining = remaining.split(alias).join(" ");
  }
  const conflicting = matched.filter((district) => district !== boundaryDistrict);
  return conflicting.length > 0 ? { status: "conflict", namedDistricts: conflicting } : { status: "consistent" };
}
