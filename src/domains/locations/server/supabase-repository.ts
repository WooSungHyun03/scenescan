import "server-only";
import { getSupabaseClient } from "@/infrastructure/supabase/server-client";
import { dataAccessError } from "@/shared/errors/application-error";
import { logger } from "@/shared/observability/logger";
import { SEARCH_MATCH_COUNT_DEFAULT, SEARCH_MATCH_THRESHOLD_DEFAULT } from "@/types/contracts";
import type { Location, LocationDetail, LocationFilter, LocationListQuery, LocationSearchResult, SearchQueryOptions } from "@/types/domain";
import { groupImageMatches, type ImageMatch } from "@/domains/locations/services/group-image-matches";
import { rankSimilarLocations } from "@/domains/locations/services/similar-locations";
import { CLIP_MODEL_ID, CLIP_MODEL_REVISION } from "@/lib/ai/embedding-service";
import { resolveLocationListPagination } from "./pagination";
import {
  parseLocationRow,
  parseLocationRows,
  parseMatchLocationImageHits,
  parseMatchLocationImagesRows,
  toImageMatch,
  toImageMatchFromHit,
  toLocation,
  type LocationRow,
} from "./supabase-mappers";

// TODO(embedding-model-key): src/lib/ai/embedding-service.ts (Member 1's
// module) exports CLIP_MODEL_ID and CLIP_MODEL_REVISION separately but has
// no single exported "model@revision" key. This is the one place that joins
// them today. scripts/embeddings/importer.ts will need to produce this exact
// same string once it starts writing location_images.embedding_model, so the
// join logic should end up in exactly one place shared by both -- proposed:
// add `export const CLIP_MODEL_KEY = \`${CLIP_MODEL_ID}@${CLIP_MODEL_REVISION}\`;`
// to src/lib/ai/embedding-service.ts and have both sides import it instead of
// building the string themselves (see report for the full suggested diff).
export function buildEmbeddingModelKey(modelId: string, revision: string): string {
  return `${modelId}@${revision}`;
}

// Must match the embedding_model value written by whatever produced
// location_images.embedding (see docs/database.md). match_location_images
// treats a mismatch (or a missing value) as "no match" by design, so this
// has to stay in sync with the offline importer's model/revision.
const EXPECTED_EMBEDDING_MODEL = buildEmbeddingModelKey(CLIP_MODEL_ID, CLIP_MODEL_REVISION);

// LOCATION_SELECT includes the attribution columns added by
// 20261001000000_location_attribution.sql (origin/main). On a project where
// that migration hasn't been applied yet, PostgREST returns a schema error
// (42703/PGRST204) naming those columns -- isMissingImageAttributionSchema
// recognizes that specific failure and every read below retries once with
// LEGACY_LOCATION_SELECT (no attribution columns) instead of failing the
// request outright.
const LOCATION_SELECT = "*, location_images(id, image_url, alt, source, source_url, author, license, license_url, last_verified_at), parking(id, name, latitude, longitude, capacity, opening_hours, price_info, source)";
const LEGACY_LOCATION_SELECT = "*, location_images(id, image_url, alt), parking(id, name, latitude, longitude, capacity, opening_hours, price_info, source)";
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

function logRowWarnings(locationId: string, warnings: ReturnType<typeof toLocation>["warnings"]): void {
  if (warnings.length === 0) return;
  logger.warn("Dropped malformed location sub-resource row", { locationId, warnings });
}

function mapRows(data: unknown): Location[] {
  let rows: LocationRow[];
  try {
    rows = parseLocationRows(data);
  } catch (parseError) {
    throw dataAccessError("Unexpected locations response shape", parseError);
  }
  return rows.map((row) => {
    const { location, warnings } = toLocation(row);
    logRowWarnings(row.id, warnings);
    return location;
  });
}

function mapRow(data: unknown): Location | null {
  let row: LocationRow | null;
  try {
    row = parseLocationRow(data);
  } catch (parseError) {
    throw dataAccessError("Unexpected location response shape", parseError);
  }
  if (!row) return null;
  const { location, warnings } = toLocation(row);
  logRowWarnings(location.id, warnings);
  return location;
}

export async function getSupabaseLocations(query: LocationListQuery = {}): Promise<Location[]> {
  const { limit, offset } = resolveLocationListPagination(query);
  // .order("id") is a tiebreaker: without it, rows with an equal `name`
  // have no guaranteed stable order, which .range()-based pagination
  // depends on to avoid skipping or repeating rows across pages.
  function buildQuery(relations: string) {
    let dbQuery = getSupabaseClient().from("locations").select(relations).order("name").order("id").range(offset, offset + limit - 1);
    if (query.region) dbQuery = dbQuery.eq("region", query.region);
    if (query.category) dbQuery = dbQuery.eq("category", query.category);
    return dbQuery;
  }
  let { data, error } = await buildQuery(LOCATION_SELECT);
  if (isMissingImageAttributionSchema(error)) {
    warnAboutLegacyAttributionSchema(error);
    ({ data, error } = await buildQuery(LEGACY_LOCATION_SELECT));
  }
  if (error) throw dataAccessError("Failed to list locations", error);
  return mapRows(data);
}

// Hydrates full Location metadata for an explicit set of IDs, used by
// search (see searchSupabaseLocations) and similar-locations (see
// getSupabaseSimilarLocations). Deliberately does not accept a
// LocationFilter or pagination: eligibility (region/category) is decided
// entirely by match_location_images's filter_region/filter_category, so the
// app only loads whatever locations the RPC actually returned, by id.
export async function getSupabaseLocationsByIds(ids: readonly string[]): Promise<Location[]> {
  if (ids.length === 0) return [];
  let { data, error } = await getSupabaseClient().from("locations").select(LOCATION_SELECT).in("id", ids);
  if (isMissingImageAttributionSchema(error)) {
    warnAboutLegacyAttributionSchema(error);
    ({ data, error } = await getSupabaseClient().from("locations").select(LEGACY_LOCATION_SELECT).in("id", ids));
  }
  if (error) throw dataAccessError("Failed to load locations by id", error);
  return mapRows(data);
}

export async function getSupabaseLocation(id: string): Promise<LocationDetail | null> {
  let { data, error } = await getSupabaseClient().from("locations")
    .select(LOCATION_SELECT)
    .eq("id", id).maybeSingle();
  if (isMissingImageAttributionSchema(error)) {
    warnAboutLegacyAttributionSchema(error);
    ({ data, error } = await getSupabaseClient().from("locations")
      .select(LEGACY_LOCATION_SELECT)
      .eq("id", id).maybeSingle());
  }
  if (error) throw dataAccessError(`Failed to load location ${id}`, error);
  return mapRow(data);
}

// Shared by both match_location_images_filtered and its legacy fallback
// below: hydrates Location metadata for exactly the matched IDs
// (getSupabaseLocationsByIds), never a filter re-query, then applies
// Member 1's grouping/limit. Safe to call even when `matches` already has
// at most one row per location (match_location_images_filtered's own
// `distinct on (location_id)` already guarantees that) -- groupImageMatches
// is a no-op in that case, not a second filtering pass to keep in sync.
async function toSearchResults(matches: ImageMatch[]): Promise<LocationSearchResult[]> {
  const locationIds = [...new Set(matches.map((match) => match.locationId))];
  const locations = await getSupabaseLocationsByIds(locationIds);
  return groupImageMatches(matches, locations, 8);
}

export async function searchSupabaseLocations(
  embedding: number[],
  filters: LocationFilter = {},
  options: SearchQueryOptions = {},
): Promise<LocationSearchResult[]> {
  const client = getSupabaseClient();
  const matchThreshold = options.threshold ?? SEARCH_MATCH_THRESHOLD_DEFAULT;
  const { data, error } = await client.rpc("match_location_images_filtered", {
    query_embedding: embedding,
    match_threshold: matchThreshold,
    match_count: 8,
    filter_region: filters.region ?? null,
    filter_category: filters.category ?? null,
    expected_embedding_model: EXPECTED_EMBEDDING_MODEL,
  });
  // Rolling deployment only: match_location_images_filtered
  // (20261002000000_filtered_location_search.sql, plus its
  // expected_embedding_model follow-up) might not exist yet on a project
  // mid-deploy. Only fall back for an unfiltered query -- the legacy RPC
  // can't honor filter_region/filter_category, so silently using it for a
  // filtered request would return wrong (unfiltered) results instead of a
  // clear error.
  if (error?.code === "PGRST202" && error.message?.includes("match_location_images_filtered")
    && !filters.region && !filters.category) {
    logger.warn("Filtered search RPC migration is pending; using legacy unfiltered search");
    const legacy = await client.rpc("match_location_images", {
      query_embedding: embedding,
      match_threshold: matchThreshold,
      match_count: SEARCH_MATCH_COUNT_DEFAULT,
      expected_embedding_model: EXPECTED_EMBEDDING_MODEL,
    });
    if (legacy.error) throw dataAccessError("Failed to search location images", legacy.error);
    let legacyRows;
    try {
      legacyRows = parseMatchLocationImagesRows(legacy.data);
    } catch (parseError) {
      throw dataAccessError("Unexpected match_location_images response shape", parseError);
    }
    return toSearchResults(legacyRows.map(toImageMatch));
  }
  if (error) throw dataAccessError("Failed to search location images", error);
  let hits;
  try {
    hits = parseMatchLocationImageHits(data);
  } catch (parseError) {
    throw dataAccessError("Unexpected match_location_images_filtered response shape", parseError);
  }
  return toSearchResults(hits.map(toImageMatchFromHit));
}

// Embedding selection for similar-locations (the mean of all of this
// location's non-null image embeddings, computed in SQL) and the
// self-exclusion/grouping policy are Member 1's (match_similar_location_images,
// supabase/migrations/20260928000000_similar_locations.sql; rankSimilarLocations,
// src/domains/locations/services/similar-locations.ts) -- reused as-is, not
// reimplemented here. Unlike match_location_images, this RPC has no
// expected_embedding_model gate; if more than one CLIP model/revision's
// embeddings ever coexist in location_images, it could silently average or
// compare across them. Flagged as a proposal for Member 1, not fixed here.
export async function getSupabaseSimilarLocations(locationId: string): Promise<LocationSearchResult[]> {
  const { data, error } = await getSupabaseClient().rpc("match_similar_location_images", {
    source_location_id: locationId,
    match_threshold: SEARCH_MATCH_THRESHOLD_DEFAULT,
    match_count: SEARCH_MATCH_COUNT_DEFAULT,
  });
  if (error) throw dataAccessError(`Failed to find locations similar to ${locationId}`, error);
  const rows = (data ?? []) as Array<{ location_image_id: string; location_id: string; similarity: number }>;
  const matches: ImageMatch[] = rows.map((row) => ({
    locationImageId: row.location_image_id,
    locationId: row.location_id,
    similarity: row.similarity,
  }));
  // getSupabaseLocationsByIds, not getSupabaseLocations(): the latter is now
  // paginated (LOCATION_LIST_DEFAULT_LIMIT = 20), so calling it with no
  // arguments would silently miss any location past the first page --
  // both for the matched candidates and, critically, for the selected
  // location itself. rankSimilarLocations's own "is selectedLocationId a
  // real location" guard checks membership in the `locations` array it's
  // given, so the selected id is included here even though the RPC's SQL
  // already excludes it from `matches`/the candidate ids -- otherwise that
  // guard would always see it missing and return [] unconditionally.
  const locationIds = [...new Set([...matches.map((match) => match.locationId), locationId])];
  const locations = await getSupabaseLocationsByIds(locationIds);
  return rankSimilarLocations(locationId, matches, locations, 8);
}
