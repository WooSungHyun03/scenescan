import "server-only";
import { getSupabaseClient } from "@/infrastructure/supabase/server-client";
import { dataAccessError } from "@/shared/errors/application-error";
import { logger } from "@/shared/observability/logger";
import type { Location, LocationFilter, LocationSearchResult, ParkingInfo } from "@/types/domain";
import { groupImageMatches, type ImageMatch } from "@/domains/locations/services/group-image-matches";
import { rankSimilarLocations } from "@/domains/locations/services/similar-locations";

type Row = {
  id: string; name: string; description: string; category: Location["category"];
  region: Location["region"]; address: string; latitude: number; longitude: number;
  permit_type: string; contact_name: string | null; contact_phone: string | null;
  permit_note: string | null; noise_sources: Location["noiseSources"] | null;
  source?: string | null; source_url?: string | null; author?: string | null;
  license?: string | null; license_url?: string | null; last_verified_at?: string | null;
  location_images: Array<{
    id: string; image_url: string; alt: string | null; source?: string | null;
    source_url?: string | null; author?: string | null; license?: string | null;
    license_url?: string | null; last_verified_at?: string | null;
  }>;
  parking: { id: string; name: string; latitude: number; longitude: number; capacity: number | null; opening_hours: string | null; price_info: string | null; source: string | null }[];
};

function toLocation(row: Row): Location {
  return {
    id: row.id, name: row.name, description: row.description,
    category: row.category, region: row.region, address: row.address,
    point: { latitude: row.latitude, longitude: row.longitude },
    images: row.location_images.map((image) => ({
      id: image.id,
      locationId: row.id,
      imageUrl: image.image_url,
      alt: image.alt ?? row.name,
      source: image.source ?? null,
      sourceUrl: image.source_url ?? null,
      author: image.author ?? null,
      license: image.license ?? null,
      licenseUrl: image.license_url ?? null,
      lastVerifiedAt: image.last_verified_at ?? null,
    })),
    permit: { type: row.permit_type, contactName: row.contact_name, contactPhone: row.contact_phone, note: row.permit_note },
    parking: row.parking.map((item): ParkingInfo => ({ id: item.id, locationId: row.id, name: item.name, point: { latitude: item.latitude, longitude: item.longitude }, capacity: item.capacity, openingHours: item.opening_hours, priceInfo: item.price_info, source: item.source })),
    noiseSources: row.noise_sources ?? [],
    source: row.source ?? null,
    sourceUrl: row.source_url ?? null,
    author: row.author ?? null,
    license: row.license ?? null,
    licenseUrl: row.license_url ?? null,
    lastVerifiedAt: row.last_verified_at ?? null,
  };
}

const LOCATION_RELATIONS = "*, location_images(id, image_url, alt, source, source_url, author, license, license_url, last_verified_at), parking(id, name, latitude, longitude, capacity, opening_hours, price_info, source)";
const LEGACY_LOCATION_RELATIONS = "*, location_images(id, image_url, alt), parking(id, name, latitude, longitude, capacity, opening_hours, price_info, source)";
const IMAGE_ATTRIBUTION_COLUMNS = ["source", "source_url", "author", "license", "license_url", "last_verified_at"];

type SupabaseQueryError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function isMissingImageAttributionSchema(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const queryError = error as SupabaseQueryError;
  if (queryError.code !== "42703" && queryError.code !== "PGRST204") return false;
  const description = [queryError.message, queryError.details, queryError.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return description.includes("location_images")
    && IMAGE_ATTRIBUTION_COLUMNS.some((column) => description.includes(column));
}

function warnAboutLegacyAttributionSchema(error: unknown): void {
  const queryError = error as SupabaseQueryError;
  logger.warn("Image attribution columns are unavailable; using the legacy location schema", {
    code: queryError.code ?? "unknown",
  });
}

async function listLocationRows(relations: string, filters: LocationFilter, ids?: string[]) {
  let query = getSupabaseClient().from("locations").select(relations).order("name");
  if (filters.region) query = query.eq("region", filters.region);
  if (filters.category) query = query.eq("category", filters.category);
  if (ids) query = query.in("id", ids);
  return query;
}

async function loadLocationRow(id: string, relations: string) {
  return getSupabaseClient().from("locations")
    .select(relations)
    .eq("id", id).maybeSingle();
}

export async function getSupabaseLocations(filters: LocationFilter = {}, ids?: string[]): Promise<Location[]> {
  if (ids?.length === 0) return [];
  let { data, error } = await listLocationRows(LOCATION_RELATIONS, filters, ids);
  if (isMissingImageAttributionSchema(error)) {
    warnAboutLegacyAttributionSchema(error);
    ({ data, error } = await listLocationRows(LEGACY_LOCATION_RELATIONS, filters, ids));
  }
  if (error) throw dataAccessError("Failed to list locations", error);
  return (data as unknown as Row[]).map(toLocation);
}

export async function getSupabaseLocation(id: string): Promise<Location | null> {
  let { data, error } = await loadLocationRow(id, LOCATION_RELATIONS);
  if (isMissingImageAttributionSchema(error)) {
    warnAboutLegacyAttributionSchema(error);
    ({ data, error } = await loadLocationRow(id, LEGACY_LOCATION_RELATIONS));
  }
  if (error) throw dataAccessError(`Failed to load location ${id}`, error);
  return data ? toLocation(data as unknown as Row) : null;
}

export async function searchSupabaseLocations(embedding: number[], filters: LocationFilter = {}): Promise<LocationSearchResult[]> {
  const client = getSupabaseClient();
  let { data, error } = await client.rpc("match_location_images_filtered", {
    query_embedding: embedding,
    match_threshold: 0,
    match_count: 8,
    filter_region: filters.region ?? null,
    filter_category: filters.category ?? null,
  });
  // Rolling deployment only: never silently use incorrect post-limit filtering.
  if (error?.code === "PGRST202" && error.message?.includes("match_location_images_filtered")
    && !filters.region && !filters.category) {
    logger.warn("Filtered search RPC migration is pending; using legacy unfiltered search");
    ({ data, error } = await client.rpc("match_location_images", {
      query_embedding: embedding, match_threshold: 0, match_count: 200,
    }));
  }
  if (error) throw dataAccessError("Failed to search location images", error);
  const matches: ImageMatch[] = (data ?? []).map((row: { location_image_id: string; location_id: string; similarity: number }) => ({
    locationImageId: row.location_image_id, locationId: row.location_id, similarity: row.similarity,
  }));
  const locations = await getSupabaseLocations(filters, [...new Set(matches.map((match) => match.locationId))]);
  return groupImageMatches(matches, locations, 8);
}

export async function getSupabaseSimilarLocations(id: string): Promise<LocationSearchResult[]> {
  const locations = await getSupabaseLocations();
  if (!locations.some((location) => location.id === id)) return [];
  const { data, error } = await getSupabaseClient().rpc("match_similar_location_images", {
    source_location_id: id,
    match_threshold: 0,
    match_count: 200,
  });
  if (error) throw dataAccessError(`Failed to find locations similar to ${id}`, error);
  const matches: ImageMatch[] = (data ?? []).map((row: { location_image_id: string; location_id: string; similarity: number }) => ({
    locationImageId: row.location_image_id,
    locationId: row.location_id,
    similarity: row.similarity,
  }));
  return rankSimilarLocations(id, matches, locations, 8);
}
