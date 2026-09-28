import { z } from "zod";
import type { Location, ParkingInfo } from "@/types/domain";
import type { ImageMatch } from "@/domains/locations/services/group-image-matches";

// Deliberately does not import "server-only" (unlike supabase-repository.ts)
// so it can be unit tested directly under plain Vitest -- see
// supabase-mappers.test.ts and the report for this change.

export type LocationImageRow = {
  id: unknown;
  image_url: unknown;
  alt: unknown;
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
  noise_sources: Location["noiseSources"] | null;
  source_url: string | null;
  location_images: LocationImageRow[] | null;
  parking: ParkingRow[] | null;
};

export type MapperWarning = { field: "location_images" | "parking"; reason: string; value: unknown };

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

function mapImage(row: LocationImageRow, locationId: string, fallbackAlt: string, warnings: MapperWarning[]): Location["images"][number] | null {
  if (!isNonEmptyString(row?.id) || !isNonEmptyString(row?.image_url)) {
    warnings.push({ field: "location_images", reason: "missing required id or image_url", value: row });
    return null;
  }
  return { id: row.id, locationId, imageUrl: row.image_url, alt: optionalString(row.alt) ?? fallbackAlt };
}

function mapParking(row: ParkingRow, locationId: string, warnings: MapperWarning[]): ParkingInfo | null {
  if (!isNonEmptyString(row?.id) || !isNonEmptyString(row?.name) || !isFiniteNumber(row?.latitude) || !isFiniteNumber(row?.longitude)) {
    warnings.push({ field: "parking", reason: "missing required id, name, latitude, or longitude", value: row });
    return null;
  }
  return {
    id: row.id,
    locationId,
    name: row.name,
    point: { latitude: row.latitude, longitude: row.longitude },
    capacity: isFiniteNumber(row.capacity) ? row.capacity : null,
    openingHours: optionalString(row.opening_hours),
    priceInfo: optionalString(row.price_info),
    source: optionalString(row.source),
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
  const location: Location = {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    region: row.region,
    address: row.address,
    point: { latitude: row.latitude, longitude: row.longitude },
    images,
    permit: { type: row.permit_type, contactName: row.contact_name, contactPhone: row.contact_phone, note: row.permit_note },
    parking,
    noiseSources: row.noise_sources ?? [],
    sourceUrl: row.source_url,
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
