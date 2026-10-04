import { z } from "zod";
import type { Location, NoiseSource, NoiseSourceKind, ParkingInfo } from "@/types/domain";
import type { ImageMatch } from "@/domains/locations/services/group-image-matches";

// Deliberately does not import "server-only" (unlike supabase-repository.ts)
// so it can be unit tested directly under plain Vitest -- see
// supabase-mappers.test.ts and the report for this change.

export type LocationImageRow = {
  id: unknown;
  image_url: unknown;
  alt: unknown;
  source?: unknown;
  source_url?: unknown;
  author?: unknown;
  license?: unknown;
  license_url?: unknown;
  last_verified_at?: unknown;
};

export type ParkingRow = {
  id: unknown;
  name: unknown;
  latitude: unknown;
  longitude: unknown;
  capacity: unknown;
  opening_hours: unknown;
  price_info: unknown;
  source: unknown;
  relationship?: unknown;
  source_url?: unknown;
  reference_date?: unknown;
  last_verified_at?: unknown;
};

export type LocationRow = {
  id: string;
  name: string;
  description: string;
  category: Location["category"];
  region: Location["region"];
  address: string;
  latitude: number;
  longitude: number;
  permit_type: string;
  contact_name: string | null;
  contact_phone: string | null;
  permit_note: string | null;
  permit_source?: unknown;
  permit_source_url?: unknown;
  permit_reference_date?: unknown;
  permit_last_verified_at?: unknown;
  noise_sources: unknown;
  source_url: string | null;
  source?: unknown;
  author?: unknown;
  license?: unknown;
  license_url?: unknown;
  last_verified_at?: unknown;
  location_images: LocationImageRow[] | null;
  parking: ParkingRow[] | null;
};

// getSupabaseClient() (src/infrastructure/supabase/server-client.ts) creates
// a plain, un-parameterized SupabaseClient -- this project has no generated
// Database type, so supabase-js's .select() always falls back to its
// internal GenericStringError placeholder type regardless of what's
// selected, with essentially no structural overlap with LocationRow. A
// direct `as LocationRow` cast is rejected by tsc for exactly that reason.
// Validating the required scalar columns here (all `not null` in
// supabase/migrations/20260920000000_initial_schema.sql, so a real row
// always has them) turns that unchecked cast into a checked one: a
// mismatch -- most plausibly a renamed/typo'd column in LOCATION_SELECT,
// a real bug, not malformed data -- throws a clear ZodError naming the
// field instead of silently propagating `undefined` into the API
// response. location_images/parking stay loosely typed (just "array of
// objects, or null"): per-field validation of those is mapImage/mapParking's
// job below, which already drops a malformed sub-row instead of throwing.
const locationRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  region: z.string(),
  address: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  permit_type: z.string(),
  contact_name: z.string().nullable(),
  contact_phone: z.string().nullable(),
  permit_note: z.string().nullable(),
  permit_source: z.unknown().optional(),
  permit_source_url: z.unknown().optional(),
  permit_reference_date: z.unknown().optional(),
  permit_last_verified_at: z.unknown().optional(),
  noise_sources: z.unknown().nullable().optional(),
  source_url: z.string().nullable(),
  source: z.unknown().optional(),
  author: z.unknown().optional(),
  license: z.unknown().optional(),
  license_url: z.unknown().optional(),
  last_verified_at: z.unknown().optional(),
  location_images: z.array(z.record(z.string(), z.unknown())).nullable(),
  parking: z.array(z.record(z.string(), z.unknown())).nullable(),
});

const locationRowsSchema = z.array(locationRowSchema);

/** Throws a ZodError on an unexpected shape; the caller wraps it into a dataAccessError, same as parseMatchLocationImagesRows below. */
export function parseLocationRows(data: unknown): LocationRow[] {
  return locationRowsSchema.parse(data ?? []) as unknown as LocationRow[];
}

/** Single-row counterpart of parseLocationRows, for .maybeSingle() callers. Returns null for a null/undefined row (missing id). */
export function parseLocationRow(data: unknown): LocationRow | null {
  if (data === null || data === undefined) return null;
  return locationRowSchema.parse(data) as unknown as LocationRow;
}

export type MapperWarning = { field: "location_images" | "parking" | "noise_sources"; reason: string; value: unknown };

export type MapLocationResult = { location: Location; warnings: MapperWarning[] };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function optionalString(value: unknown): string | null {
  return isNonEmptyString(value) ? value : null;
}

function isHttpUrl(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(new Date(`${value}T00:00:00Z`).getTime());
}

function isIsoDateTime(value: unknown): value is string {
  return typeof value === "string" && /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    && Number.isFinite(new Date(value).getTime());
}

const noiseKinds = new Set<NoiseSourceKind>(["railway", "major_road", "airport", "construction", "other"]);

function legacyNoiseSource(description: string): NoiseSource {
  return {
    kind: "other",
    description,
    distanceMeters: null,
    evidence: null,
    source: null,
    sourceUrl: null,
    license: null,
    licenseUrl: null,
    referenceDate: null,
    lastVerifiedAt: null,
  };
}

function mapNoiseSources(value: unknown, warnings: MapperWarning[]): NoiseSource[] {
  if (value === null || value === undefined) return [];
  if (!Array.isArray(value)) {
    warnings.push({ field: "noise_sources", reason: "expected a JSON array", value });
    return [];
  }
  const sources: NoiseSource[] = [];
  const seenSourceUrls = new Set<string>();
  for (const item of value) {
    if (isNonEmptyString(item)) {
      sources.push(legacyNoiseSource(item.trim()));
      continue;
    }
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      warnings.push({ field: "noise_sources", reason: "entry is neither a legacy string nor an object", value: item });
      continue;
    }
    const row = item as Record<string, unknown>;
    const legacyNote = optionalString(row.note);
    const description = optionalString(row.description) ?? legacyNote;
    const rawKind = optionalString(row.kind);
    if (legacyNote && !row.description) {
      sources.push({ ...legacyNoiseSource(legacyNote), kind: rawKind && noiseKinds.has(rawKind as NoiseSourceKind) ? rawKind as NoiseSourceKind : "other" });
      continue;
    }
    const kind = rawKind as NoiseSourceKind | null;
    const distanceMeters = row.distanceMeters === null ? null : row.distanceMeters;
    const evidence = row.evidence === null ? null : optionalString(row.evidence);
    const source = optionalString(row.source);
    const sourceUrl = isHttpUrl(row.sourceUrl) ? row.sourceUrl : null;
    const license = optionalString(row.license);
    const licenseUrl = isHttpUrl(row.licenseUrl) ? row.licenseUrl : null;
    const referenceDate = row.referenceDate === null ? null : isIsoDate(row.referenceDate) ? row.referenceDate : null;
    const lastVerifiedAt = row.lastVerifiedAt === null ? null : isIsoDateTime(row.lastVerifiedAt) ? row.lastVerifiedAt : null;
    const valid = Boolean(
      kind && noiseKinds.has(kind)
      && description
      && (distanceMeters === null || (isFiniteNumber(distanceMeters) && distanceMeters >= 0))
      && (distanceMeters !== null || evidence)
      && source && sourceUrl && license && licenseUrl && lastVerifiedAt
      && (row.referenceDate === null || referenceDate),
    );
    if (!valid) {
      warnings.push({ field: "noise_sources", reason: "malformed structured noise-source provenance or evidence", value: item });
      continue;
    }
    if (seenSourceUrls.has(sourceUrl!)) {
      warnings.push({ field: "noise_sources", reason: "duplicate source URL", value: item });
      continue;
    }
    seenSourceUrls.add(sourceUrl!);
    sources.push({
      kind: kind!,
      description: description!,
      distanceMeters: distanceMeters as number | null,
      evidence,
      source: source!,
      sourceUrl: sourceUrl!,
      license: license!,
      licenseUrl: licenseUrl!,
      referenceDate,
      lastVerifiedAt: lastVerifiedAt!,
    });
  }
  return sources;
}

function mapImage(row: LocationImageRow, locationId: string, fallbackAlt: string, warnings: MapperWarning[]): Location["images"][number] | null {
  if (!isNonEmptyString(row?.id) || !isNonEmptyString(row?.image_url)) {
    warnings.push({ field: "location_images", reason: "missing required id or image_url", value: row });
    return null;
  }
  return {
    id: row.id,
    locationId,
    imageUrl: row.image_url,
    alt: optionalString(row.alt) ?? fallbackAlt,
    source: optionalString(row.source),
    sourceUrl: optionalString(row.source_url),
    author: optionalString(row.author),
    license: optionalString(row.license),
    licenseUrl: optionalString(row.license_url),
    lastVerifiedAt: optionalString(row.last_verified_at),
  };
}

function mapParking(row: ParkingRow, locationId: string, warnings: MapperWarning[]): ParkingInfo | null {
  if (!isNonEmptyString(row?.id) || !isNonEmptyString(row?.name) || !isFiniteNumber(row?.latitude) || !isFiniteNumber(row?.longitude)) {
    warnings.push({ field: "parking", reason: "missing required id, name, latitude, or longitude", value: row });
    return null;
  }
  return {
    id: row.id,
    locationId,
    relationship: row.relationship === "on_site" ? "on_site" : "nearby",
    name: row.name,
    point: { latitude: row.latitude, longitude: row.longitude },
    capacity: isFiniteNumber(row.capacity) ? row.capacity : null,
    openingHours: optionalString(row.opening_hours),
    priceInfo: optionalString(row.price_info),
    source: optionalString(row.source),
    sourceUrl: optionalString(row.source_url),
    referenceDate: optionalString(row.reference_date),
    lastVerifiedAt: optionalString(row.last_verified_at),
  };
}

/**
 * Maps one `locations` row (with its embedded location_images/parking
 * relations) to the public Location shape. Never throws on a malformed
 * image or parking entry -- those are dropped and reported as warnings so
 * one bad row doesn't fail the whole request; the caller is expected to log
 * `warnings` (see supabase-repository.ts).
 */
export function toLocation(row: LocationRow): MapLocationResult {
  const warnings: MapperWarning[] = [];
  const images = (row.location_images ?? [])
    .map((image) => mapImage(image, row.id, row.name, warnings))
    .filter((image): image is Location["images"][number] => image !== null);
  const parking = (row.parking ?? [])
    .map((item) => mapParking(item, row.id, warnings))
    .filter((item): item is ParkingInfo => item !== null);
  const noiseSources = mapNoiseSources(row.noise_sources, warnings);
  const location: Location = {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    region: row.region,
    address: row.address,
    point: { latitude: row.latitude, longitude: row.longitude },
    images,
    permit: {
      type: row.permit_type,
      contactName: row.contact_name,
      contactPhone: row.contact_phone,
      note: row.permit_note,
      source: optionalString(row.permit_source),
      sourceUrl: optionalString(row.permit_source_url),
      referenceDate: optionalString(row.permit_reference_date),
      lastVerifiedAt: optionalString(row.permit_last_verified_at),
    },
    parking,
    noiseSources,
    source: optionalString(row.source),
    sourceUrl: row.source_url,
    author: optionalString(row.author),
    license: optionalString(row.license),
    licenseUrl: optionalString(row.license_url),
    lastVerifiedAt: optionalString(row.last_verified_at),
  };
  return { location, warnings };
}

// match_location_images RPC response shape (see
// supabase/migrations/20260928010000_match_location_images_filters.sql and
// docs/search-ranking.md). Validated at runtime because a Supabase client
// response is `unknown` at the type level -- a schema drift or an
// unexpected null would otherwise surface as an opaque TypeError deep in
// Member 1's ranking utility instead of a clear, reportable error here.
export const matchLocationImagesRowSchema = z.object({
  image_id: z.string().uuid(),
  location_id: z.string().uuid(),
  image_url: z.string(),
  similarity: z.number().finite(),
});

export const matchLocationImagesRowsSchema = z.array(matchLocationImagesRowSchema);

export type MatchLocationImagesRow = z.infer<typeof matchLocationImagesRowSchema>;

export function toImageMatch(row: MatchLocationImagesRow): ImageMatch {
  return { locationImageId: row.image_id, locationId: row.location_id, similarity: row.similarity };
}

/** Throws a ZodError on an unexpected shape; the caller wraps it into a dataAccessError. */
export function parseMatchLocationImagesRows(data: unknown): MatchLocationImagesRow[] {
  return matchLocationImagesRowsSchema.parse(data ?? []);
}

// match_location_images_filtered RPC response shape (see
// supabase/migrations/20261002000000_filtered_location_search.sql) --
// already deduplicated to one row per location by the RPC's own
// `distinct on (location_id)`, so unlike match_location_images there is no
// image_url column and the id column is named location_image_id, not
// image_id. Same validation rationale as matchLocationImagesRowSchema
// above.
export const matchLocationImageHitSchema = z.object({
  location_image_id: z.string().uuid(),
  location_id: z.string().uuid(),
  similarity: z.number().finite(),
});

export const matchLocationImageHitsSchema = z.array(matchLocationImageHitSchema);

export type MatchLocationImageHit = z.infer<typeof matchLocationImageHitSchema>;

export function toImageMatchFromHit(hit: MatchLocationImageHit): ImageMatch {
  return { locationImageId: hit.location_image_id, locationId: hit.location_id, similarity: hit.similarity };
}

/** Throws a ZodError on an unexpected shape; the caller wraps it into a dataAccessError. */
export function parseMatchLocationImageHits(data: unknown): MatchLocationImageHit[] {
  return matchLocationImageHitsSchema.parse(data ?? []);
}
