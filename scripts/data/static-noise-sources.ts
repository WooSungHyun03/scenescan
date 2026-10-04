import { z } from "zod";
import type { CanonicalNoiseSourceRecord, NormalizedLocationOutput } from "./contracts.ts";
import { distanceMeters } from "./static-parking.ts";
import {
  isNoiseSourceVerificationStale,
  NOISE_SOURCE_MAX_AGE_DAYS,
} from "../../src/domains/locations/services/noise-source.ts";

export const OPENSTREETMAP_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";
export const OPENSTREETMAP_LICENSE = "Open Data Commons Open Database License (ODbL) 1.0";
export const OPENSTREETMAP_ATTRIBUTION = "© OpenStreetMap contributors";
export const MAX_NOISE_SOURCE_DISTANCE_METERS = 5_000;

const httpUrl = z.string().trim().url().refine(
  (value) => value.startsWith("https://") || value.startsWith("http://"),
  "URL must use http or https",
);

const catalogNoiseSourceSchema = z.object({
  source_element_id: z.string().regex(/^(node|way|relation)\/\d+$/),
  kind: z.enum(["railway", "major_road", "airport", "construction"]),
  description: z.string().trim().min(1),
  feature_latitude: z.number().finite().min(-90).max(90),
  feature_longitude: z.number().finite().min(-180).max(180),
  evidence: z.string().trim().min(1).nullable(),
  source: z.string().trim().min(1),
  source_url: httpUrl,
  license: z.string().trim().min(1),
  license_url: httpUrl,
  reference_date: z.iso.date().nullable(),
  last_verified_at: z.iso.datetime({ offset: true }),
}).strict();

const staticNoiseSourceCatalogSchema = z.object({
  schema_version: z.literal(1),
  attribution: z.object({
    source: z.literal(OPENSTREETMAP_ATTRIBUTION),
    license: z.literal(OPENSTREETMAP_LICENSE),
    license_url: z.literal(OPENSTREETMAP_COPYRIGHT_URL),
  }).strict(),
  locations: z.array(z.object({
    location_id: z.string().uuid(),
    noise_sources: z.array(catalogNoiseSourceSchema).min(1),
  }).strict()),
}).strict();

export type StaticNoiseSourceCatalog = z.infer<typeof staticNoiseSourceCatalogSchema>;

export function parseStaticNoiseSourceCatalog(
  value: unknown,
  now = new Date(),
): StaticNoiseSourceCatalog {
  const catalog = staticNoiseSourceCatalogSchema.parse(value);
  const locationIds = new Set<string>();
  const sourceElementIds = new Set<string>();
  for (const entry of catalog.locations) {
    if (locationIds.has(entry.location_id)) {
      throw new Error(`Static noise-source catalog contains duplicate location_id: ${entry.location_id}`);
    }
    locationIds.add(entry.location_id);
    const sourceUrls = new Set<string>();
    for (const source of entry.noise_sources) {
      if (sourceUrls.has(source.source_url)) {
        throw new Error(`Static noise-source catalog duplicates source URL for ${entry.location_id}: ${source.source_url}`);
      }
      sourceUrls.add(source.source_url);
      if (sourceElementIds.has(source.source_element_id)) {
        throw new Error(`Static noise-source catalog reuses source element: ${source.source_element_id}`);
      }
      sourceElementIds.add(source.source_element_id);
      if (isNoiseSourceVerificationStale(source.last_verified_at, now)) {
        throw new Error(`Static noise source verification is older than ${NOISE_SOURCE_MAX_AGE_DAYS} days: ${source.source_url}`);
      }
    }
  }
  return catalog;
}

function toCanonicalNoiseSource(
  location: { latitude: number; longitude: number; name: string },
  source: StaticNoiseSourceCatalog["locations"][number]["noise_sources"][number],
): CanonicalNoiseSourceRecord {
  const distance = Math.round(distanceMeters(location, {
    latitude: source.feature_latitude,
    longitude: source.feature_longitude,
  }));
  if (distance > MAX_NOISE_SOURCE_DISTANCE_METERS) {
    throw new Error(
      `${source.source_element_id} is ${distance}m from ${location.name}; expected noise sources must be within ${MAX_NOISE_SOURCE_DISTANCE_METERS}m`,
    );
  }
  return {
    kind: source.kind,
    description: source.description,
    distanceMeters: distance,
    evidence: source.evidence,
    license: source.license,
    licenseUrl: source.license_url,
    provenance: {
      source: source.source,
      sourceUrl: source.source_url,
      referenceDate: source.reference_date,
      lastVerifiedAt: source.last_verified_at,
    },
  };
}

export function applyStaticNoiseSourceCatalog(
  dataset: NormalizedLocationOutput,
  catalog: StaticNoiseSourceCatalog,
): NormalizedLocationOutput {
  const byId = new Map(dataset.locations.map((location) => [location.id, location]));
  for (const entry of catalog.locations) {
    const location = byId.get(entry.location_id);
    if (!location) throw new Error(`Static noise-source catalog references unknown location_id: ${entry.location_id}`);
    if (location.noiseSources.length > 0) {
      throw new Error(`Location already has noise-source records before catalog merge: ${location.name}`);
    }
    location.noiseSources = entry.noise_sources
      .map((source) => toCanonicalNoiseSource(location, source))
      .sort((left, right) => (left.distanceMeters ?? Number.POSITIVE_INFINITY) - (right.distanceMeters ?? Number.POSITIVE_INFINITY));
  }
  return dataset;
}
