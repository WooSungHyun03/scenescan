import { z } from "zod";
import type { CanonicalParkingRecord, NormalizedLocationOutput } from "./contracts.ts";

export const STATIC_PARKING_SOURCE_URL = "https://www.data.go.kr/data/15012896/standard.do";
export const MAX_NEARBY_PARKING_DISTANCE_METERS = 1_500;

const httpUrl = z.string().trim().url().refine(
  (value) => value.startsWith("https://") || value.startsWith("http://"),
  "URL must use http or https",
);

const parkingCatalogRecordSchema = z.object({
  source_record_id: z.string().trim().min(1),
  relationship: z.enum(["on_site", "nearby"]),
  name: z.string().trim().min(1),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  capacity: z.number().int().nonnegative().nullable(),
  opening_hours: z.string().trim().min(1).nullable(),
  price_info: z.string().trim().min(1).nullable(),
  source: z.string().trim().min(1),
  source_url: httpUrl,
  reference_date: z.iso.date(),
  last_verified_at: z.iso.datetime({ offset: true }),
}).strict();

const staticParkingCatalogSchema = z.object({
  schema_version: z.literal(1),
  locations: z.array(z.object({
    location_id: z.string().uuid(),
    parking: z.array(parkingCatalogRecordSchema).min(1),
  }).strict()),
}).strict();

export type StaticParkingCatalog = z.infer<typeof staticParkingCatalogSchema>;

function parkingKey(name: string, latitude: number, longitude: number): string {
  return `${name.trim().toLocaleLowerCase("ko-KR")}\u0000${latitude.toFixed(6)}\u0000${longitude.toFixed(6)}`;
}

export function parseStaticParkingCatalog(value: unknown): StaticParkingCatalog {
  const catalog = staticParkingCatalogSchema.parse(value);
  const locationIds = new Set<string>();
  const sourceRecordIds = new Set<string>();
  const physicalParking = new Map<string, string>();
  for (const entry of catalog.locations) {
    if (locationIds.has(entry.location_id)) {
      throw new Error(`Static parking catalog contains duplicate location_id: ${entry.location_id}`);
    }
    locationIds.add(entry.location_id);
    for (const parking of entry.parking) {
      if (sourceRecordIds.has(parking.source_record_id)) {
        throw new Error(`Static parking catalog reuses source_record_id: ${parking.source_record_id}`);
      }
      sourceRecordIds.add(parking.source_record_id);
      const key = parkingKey(parking.name, parking.latitude, parking.longitude);
      const previousLocation = physicalParking.get(key);
      if (previousLocation) {
        throw new Error(
          `Static parking catalog duplicates ${parking.name} for ${previousLocation} and ${entry.location_id}`,
        );
      }
      physicalParking.set(key, entry.location_id);
    }
  }
  return catalog;
}

export function distanceMeters(
  origin: { latitude: number; longitude: number },
  destination: { latitude: number; longitude: number },
): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(destination.latitude - origin.latitude);
  const longitudeDelta = radians(destination.longitude - origin.longitude);
  const originLatitude = radians(origin.latitude);
  const destinationLatitude = radians(destination.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function toCanonicalParking(
  location: { latitude: number; longitude: number; name: string },
  parking: StaticParkingCatalog["locations"][number]["parking"][number],
): CanonicalParkingRecord {
  const distance = distanceMeters(location, parking);
  if (parking.relationship === "nearby" && distance > MAX_NEARBY_PARKING_DISTANCE_METERS) {
    throw new Error(
      `${parking.name} is ${Math.round(distance)}m from ${location.name}; nearby parking must be within ${MAX_NEARBY_PARKING_DISTANCE_METERS}m`,
    );
  }
  if (parking.relationship === "on_site" && distance > 300) {
    throw new Error(`${parking.name} is too far from ${location.name} to be reviewed as on-site parking`);
  }
  return {
    relationship: parking.relationship,
    name: parking.name,
    latitude: parking.latitude,
    longitude: parking.longitude,
    capacity: parking.capacity,
    openingHours: parking.opening_hours,
    priceInfo: parking.price_info,
    provenance: {
      source: parking.source,
      sourceUrl: parking.source_url,
      referenceDate: parking.reference_date,
      lastVerifiedAt: parking.last_verified_at,
    },
  };
}

export function applyStaticParkingCatalog(
  dataset: NormalizedLocationOutput,
  catalog: StaticParkingCatalog,
): NormalizedLocationOutput {
  const byId = new Map(dataset.locations.map((location) => [location.id, location]));
  for (const entry of catalog.locations) {
    const location = byId.get(entry.location_id);
    if (!location) throw new Error(`Static parking catalog references unknown location_id: ${entry.location_id}`);
    if (location.parking.length > 0) {
      throw new Error(`Location already has parking records before catalog merge: ${location.name}`);
    }
    location.parking = entry.parking
      .map((parking) => toCanonicalParking(location, parking))
      .sort((left, right) => distanceMeters(location, left) - distanceMeters(location, right));
  }
  return dataset;
}
