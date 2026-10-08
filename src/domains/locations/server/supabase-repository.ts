import "server-only";
import { getSupabaseClient } from "@/infrastructure/supabase/server-client";
import { dataAccessError } from "@/shared/errors/application-error";
import { logger } from "@/shared/observability/logger";
import { SEARCH_MATCH_COUNT_DEFAULT, SEARCH_MATCH_THRESHOLD_DEFAULT } from "@/types/contracts";
import type { Location, LocationDetail, LocationFilter, LocationListQuery, LocationSearchResult, SearchQueryOptions } from "@/types/domain";
import { groupImageMatches, type ImageMatch } from "@/domains/locations/services/group-image-matches";
import { rankSimilarLocations } from "@/domains/locations/services/similar-locations";
import { rankTextSearchHits } from "@/domains/locations/services/text-search-ranking";
import { CLIP_MODEL_KEY } from "@/lib/ai/embedding-config";
import type { ParsedTextSearchQuery, TextSearchResult } from "@/types/text-search";
import { resolveLocationListPagination } from "./pagination";
import {
  parseLocationRow,
  parseLocationRows,
  parseMatchLocationImageHits,
  parseMatchLocationImagesRows,
  parseSearchLocationsByTextRows,
  toImageMatch,
  toImageMatchFromHit,
  toLocation,
  toTextSearchHit,
  type LocationRow,
} from "./supabase-mappers";

// Must match the embedding_model value written by whatever produced
// location_images.embedding (see docs/database.md). match_location_images
// treats a mismatch (or a missing value) as "no match" by design, so this
// has to stay in sync with the offline importer's model/revision.
const EXPECTED_EMBEDDING_MODEL = CLIP_MODEL_KEY;

// Fixed scope for the length of the Busan-district transition (see the
// REGION_VALUES comment in src/types/location-options.ts and docs/database.md).
// Every read below applies this unconditionally -- not `filters.region`,
// which is deprecated input the app no longer trusts -- so a non-Busan row
// already present in the shared catalog (the real production table still
// has rows from all 17 regions; nothing here deletes them) can never be
// listed, loaded by id, or surfaced by search/similar. This is SQL-side
// enforcement (an .eq()/RPC parameter evaluated by Postgres), not just an
// application-level check layered on top.
const BUSAN_REGION = "부산";

// LOCATION_SELECT includes the attribution columns added by
// 20261001000000_location_attribution.sql (origin/main). On a project where
// that migration hasn't been applied yet, PostgREST returns a schema error
// (42703/PGRST204) naming those columns -- isMissingImageAttributionSchema
// recognizes that specific failure and every read below retries once with
// LEGACY_LOCATION_SELECT (no attribution columns) instead of failing the
// request outright.
const LOCATION_SELECT = "*, location_images(id, image_url, alt, source, source_url, author, license, license_url, last_verified_at), parking(id, name, relationship, latitude, longitude, capacity, opening_hours, price_info, source, source_url, reference_date, last_verified_at)";
const PRE_PARKING_METADATA_LOCATION_SELECT = "*, location_images(id, image_url, alt, source, source_url, author, license, license_url, last_verified_at), parking(id, name, latitude, longitude, capacity, opening_hours, price_info, source)";
const LEGACY_LOCATION_SELECT = "*, location_images(id, image_url, alt), parking(id, name, latitude, longitude, capacity, opening_hours, price_info, source)";
const IMAGE_ATTRIBUTION_COLUMNS = ["source", "source_url", "author", "license", "license_url", "last_verified_at"];
const PARKING_METADATA_COLUMNS = ["relationship", "source_url", "reference_date", "last_verified_at"];

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

function isMissingParkingMetadataSchema(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const queryError = error as SupabaseQueryError;
  if (queryError.code !== "42703" && queryError.code !== "PGRST204") return false;
  const description = [queryError.message, queryError.details, queryError.hint]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return description.includes("parking")
    && PARKING_METADATA_COLUMNS.some((column) => description.includes(column));
}

function warnAboutLegacyParkingSchema(error: unknown): void {
  const queryError = error as SupabaseQueryError;
  logger.warn("Parking provenance columns are unavailable; using the pre-migration parking schema", {
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
    // BUSAN_REGION is unconditional -- see its own comment -- `district`
    // stays the only conditional geo filter here.
    let dbQuery = getSupabaseClient().from("locations").select(relations).eq("region", BUSAN_REGION).order("name").order("id").range(offset, offset + limit - 1);
    if (query.district) dbQuery = dbQuery.eq("district", query.district);
    if (query.category) dbQuery = dbQuery.eq("category", query.category);
    return dbQuery;
  }
  let { data, error } = await buildQuery(LOCATION_SELECT);
  if (isMissingParkingMetadataSchema(error)) {
    warnAboutLegacyParkingSchema(error);
    ({ data, error } = await buildQuery(PRE_PARKING_METADATA_LOCATION_SELECT));
  }
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
  // .eq("region", BUSAN_REGION): both of this function's callers (explicit
  // ?id= lookups via GET /api/locations, and search/similar metadata
  // hydration for ids an already-Busan-scoped RPC returned) are each a form
  // of "직접 ID 조회" that must not surface a non-Busan row -- see BUSAN_REGION.
  let { data, error } = await getSupabaseClient().from("locations").select(LOCATION_SELECT).in("id", ids).eq("region", BUSAN_REGION);
  if (isMissingParkingMetadataSchema(error)) {
    warnAboutLegacyParkingSchema(error);
    ({ data, error } = await getSupabaseClient().from("locations").select(PRE_PARKING_METADATA_LOCATION_SELECT).in("id", ids).eq("region", BUSAN_REGION));
  }
  if (isMissingImageAttributionSchema(error)) {
    warnAboutLegacyAttributionSchema(error);
    ({ data, error } = await getSupabaseClient().from("locations").select(LEGACY_LOCATION_SELECT).in("id", ids).eq("region", BUSAN_REGION));
  }
  if (error) throw dataAccessError("Failed to load locations by id", error);
  return mapRows(data);
}

export async function getSupabaseLocation(id: string): Promise<LocationDetail | null> {
  // .eq("region", BUSAN_REGION) makes a non-Busan id behave exactly like a
  // missing id: .maybeSingle() finds no matching row and returns null, which
  // GET /api/locations/[id] (Server Component notFound()) and
  // GET /api/locations/[id]/similar (LOCATION_NOT_FOUND) already treat as
  // 404 -- no separate "wrong region" branch needed.
  let { data, error } = await getSupabaseClient().from("locations")
    .select(LOCATION_SELECT)
    .eq("id", id).eq("region", BUSAN_REGION).maybeSingle();
  if (isMissingParkingMetadataSchema(error)) {
    warnAboutLegacyParkingSchema(error);
    ({ data, error } = await getSupabaseClient().from("locations")
      .select(PRE_PARKING_METADATA_LOCATION_SELECT)
      .eq("id", id).eq("region", BUSAN_REGION).maybeSingle());
  }
  if (isMissingImageAttributionSchema(error)) {
    warnAboutLegacyAttributionSchema(error);
    ({ data, error } = await getSupabaseClient().from("locations")
      .select(LEGACY_LOCATION_SELECT)
      .eq("id", id).eq("region", BUSAN_REGION).maybeSingle());
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
  const filterDistrict = filters.district ?? null;
  let { data, error } = await client.rpc("match_location_images_filtered", {
    query_embedding: embedding,
    match_threshold: matchThreshold,
    match_count: 8,
    // filter_region is always BUSAN_REGION, never filters.region (deprecated,
    // ignored input) -- see BUSAN_REGION's comment.
    filter_region: BUSAN_REGION,
    filter_category: filters.category ?? null,
    expected_embedding_model: EXPECTED_EMBEDDING_MODEL,
    filter_district: filterDistrict,
  });
  // 20261008000000_busan_district_contract.sql's own migration might not
  // have reached this project yet (rolling deploy) even though the RPC
  // itself exists -- PostgREST reports the specific missing named parameter.
  // Only retry without it for an unfiltered-by-district query; a district
  // filter can't be honored by the 6-arg signature, so silently dropping it
  // would return wrong (unfiltered) results instead of a clear error.
  if (error?.code === "PGRST202" && error.message?.includes("filter_district")
    && error.message.includes("match_location_images_filtered")) {
    if (filterDistrict !== null) {
      throw dataAccessError("District filter requires a pending migration that has not been applied yet", error);
    }
    logger.warn("District filter migration is pending; using pre-district filtered search");
    ({ data, error } = await client.rpc("match_location_images_filtered", {
      query_embedding: embedding,
      match_threshold: matchThreshold,
      match_count: 8,
      filter_region: BUSAN_REGION,
      filter_category: filters.category ?? null,
      expected_embedding_model: EXPECTED_EMBEDDING_MODEL,
    }));
  }
  // The live pre-model schema has the same filtered/deduplicated RPC but
  // only five arguments. Keep its filters intact during migration rollout;
  // retry only PostgREST's exact missing-signature error, never a DB failure.
  if (error?.code === "PGRST202" && error.message?.includes("expected_embedding_model")
    && error.message.includes("match_location_images_filtered")) {
    if (filterDistrict !== null) {
      throw dataAccessError("District filter requires a pending migration that has not been applied yet", error);
    }
    logger.warn("Embedding model metadata migration is pending; using pre-model filtered search");
    ({ data, error } = await client.rpc("match_location_images_filtered", {
      query_embedding: embedding,
      match_threshold: matchThreshold,
      match_count: 8,
      filter_region: BUSAN_REGION,
      filter_category: filters.category ?? null,
    }));
  }
  // Rolling deployment only: match_location_images_filtered
  // (20261002000000_filtered_location_search.sql, plus its
  // expected_embedding_model follow-up) might not exist yet on a project
  // mid-deploy. Only fall back for a query with no category/district filter
  // -- the legacy RPC can't honor filter_category/filter_district, so
  // silently using it for a filtered request would return wrong (unfiltered)
  // results instead of a clear error. filter_region is still always applied
  // (BUSAN_REGION), unlike the pre-district version of this fallback.
  if (error?.code === "PGRST202" && error.message?.includes("match_location_images_filtered")
    && !filters.category && filterDistrict === null) {
    logger.warn("Filtered search RPC migration is pending; using legacy unfiltered search");
    const legacy = await client.rpc("match_location_images", {
      query_embedding: embedding,
      match_threshold: matchThreshold,
      match_count: SEARCH_MATCH_COUNT_DEFAULT,
      filter_region: BUSAN_REGION,
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

// Representative embedding and eligibility stay in SQL; application ranking
// remains a defensive contract guard. The legacy RPC is rollout-only.
export async function getSupabaseSimilarLocations(locationId: string, excludedIds: readonly string[] = []): Promise<LocationSearchResult[]> {
  const client = getSupabaseClient();
  let { data, error } = await client.rpc("match_similar_locations_filtered", {
    source_location_id: locationId,
    match_threshold: SEARCH_MATCH_THRESHOLD_DEFAULT,
    match_count: 8,
    expected_embedding_model: EXPECTED_EMBEDDING_MODEL,
    excluded_location_ids: [...excludedIds],
    // filter_region: BUSAN_REGION -- see BUSAN_REGION's comment. No public
    // district filter is exposed for similar-locations today
    // (GET /api/locations/[id]/similar has no district query param), so
    // filter_district stays null (unrestricted) here.
    filter_region: BUSAN_REGION,
    filter_district: null,
  });
  // 20261008000000_busan_district_contract.sql's region/district parameters
  // might not have reached this project yet even though
  // match_similar_locations_filtered itself exists (rolling deploy). Safe to
  // retry without them: no caller can request a district filter on this
  // endpoint, so nothing is silently dropped -- only the BUSAN_REGION safety
  // net is briefly unavailable mid-rollout, same class of gap already
  // documented for the plain legacy RPC fallback below.
  if (error?.code === "PGRST202" && error.message?.includes("filter_region")
    && error.message.includes("match_similar_locations_filtered")) {
    logger.warn("Region/district filter migration is pending; using pre-district similar search");
    ({ data, error } = await client.rpc("match_similar_locations_filtered", {
      source_location_id: locationId,
      match_threshold: SEARCH_MATCH_THRESHOLD_DEFAULT,
      match_count: 8,
      expected_embedding_model: EXPECTED_EMBEDDING_MODEL,
      excluded_location_ids: [...excludedIds],
    }));
  }
  if (error?.code === "PGRST202" && error.message?.includes("match_similar_locations_filtered")) {
    // Legacy match_similar_location_images has no region/category/district
    // join at all -- a known rollout-only gap, same caveat already
    // documented for its model-isolation limitation (docs/search-ranking.md):
    // Busan scope for similar-locations is not guaranteed until this
    // project's migrations are fully applied.
    logger.warn("Model-safe similar-search migration is pending; using legacy same-model catalog");
    ({ data, error } = await client.rpc("match_similar_location_images", {
      source_location_id: locationId,
      match_threshold: SEARCH_MATCH_THRESHOLD_DEFAULT,
      match_count: SEARCH_MATCH_COUNT_DEFAULT,
    }));
  }
  if (error) throw dataAccessError(`Failed to find locations similar to ${locationId}`, error);
  let matches: ImageMatch[];
  try {
    matches = parseMatchLocationImageHits(data).map(toImageMatchFromHit).filter((match) => !excludedIds.includes(match.locationId));
  } catch (parseError) {
    throw dataAccessError("Unexpected similar-locations response shape", parseError);
  }
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

// POST /api/search/text. Keywords/filters are plain RPC parameters (bound,
// never string-concatenated); ILIKE pattern escaping happens entirely
// inside search_locations_by_text/escape_ilike_pattern (see
// supabase/migrations/20261009000000_text_search.sql) so no caller can
// forget it. This is a brand-new RPC with no prior deployed signature, so
// -- unlike searchSupabaseLocations above -- there is no rolling-deploy
// PGRST202 fallback to maintain: a missing RPC is a genuine
// DATA_UNAVAILABLE, not a "retry with an older signature" situation.
export async function searchSupabaseLocationsByText(parsed: ParsedTextSearchQuery): Promise<TextSearchResult[]> {
  const client = getSupabaseClient();
  const { data, error } = await client.rpc("search_locations_by_text", {
    keywords: parsed.keywords,
    filter_region: BUSAN_REGION,
    filter_district: parsed.district,
    filter_category: parsed.category,
    match_count: 8,
  });
  if (error) throw dataAccessError("Failed to search locations by text", error);
  let hits;
  try {
    hits = parseSearchLocationsByTextRows(data).map(toTextSearchHit);
  } catch (parseError) {
    throw dataAccessError("Unexpected search_locations_by_text response shape", parseError);
  }
  if (hits.length === 0) return [];
  const locationIds = [...new Set(hits.map((hit) => hit.locationId))];
  const locations = await getSupabaseLocationsByIds(locationIds);
  return rankTextSearchHits(hits, locations, parsed.keywords, 8);
}
