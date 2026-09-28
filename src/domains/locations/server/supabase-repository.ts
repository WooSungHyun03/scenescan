import "server-only";
import { getSupabaseClient } from "@/infrastructure/supabase/server-client";
import { dataAccessError } from "@/shared/errors/application-error";
import { logger } from "@/shared/observability/logger";
import { SEARCH_MATCH_COUNT_DEFAULT, SEARCH_MATCH_THRESHOLD_DEFAULT } from "@/types/contracts";
import type { Location, LocationDetail, LocationFilter, LocationListQuery, LocationSearchResult, SearchQueryOptions } from "@/types/domain";
import { groupImageMatches, type ImageMatch } from "@/domains/locations/services/group-image-matches";
import { CLIP_MODEL_ID, CLIP_MODEL_REVISION } from "@/lib/ai/embedding-service";
import { resolveLocationListPagination } from "./pagination";
import { parseMatchLocationImagesRows, toImageMatch, toLocation, type LocationRow } from "./supabase-mappers";

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

const LOCATION_SELECT = "*, location_images(id, image_url, alt), parking(id, name, latitude, longitude, capacity, opening_hours, price_info, source)";

function logRowWarnings(locationId: string, warnings: ReturnType<typeof toLocation>["warnings"]): void {
  if (warnings.length === 0) return;
  logger.warn("Dropped malformed location sub-resource row", { locationId, warnings });
}

function mapRows(rows: LocationRow[]): Location[] {
  return rows.map((row) => {
    const { location, warnings } = toLocation(row);
    logRowWarnings(row.id, warnings);
    return location;
  });
}

export async function getSupabaseLocations(query: LocationListQuery = {}): Promise<Location[]> {
  const { limit, offset } = resolveLocationListPagination(query);
  // .order("id") is a tiebreaker: without it, rows with an equal `name`
  // have no guaranteed stable order, which .range()-based pagination
  // depends on to avoid skipping or repeating rows across pages.
  let dbQuery = getSupabaseClient().from("locations").select(LOCATION_SELECT).order("name").order("id").range(offset, offset + limit - 1);
  if (query.region) dbQuery = dbQuery.eq("region", query.region);
  if (query.category) dbQuery = dbQuery.eq("category", query.category);
  const { data, error } = await dbQuery;
  if (error) throw dataAccessError("Failed to list locations", error);
  return mapRows(data as LocationRow[]);
}

// Hydrates full Location metadata for an explicit set of IDs, used only by
// search (see searchSupabaseLocations). Deliberately does not accept a
// LocationFilter: eligibility (region/category) is now decided entirely by
// match_location_images's filter_region/filter_category, so the app no
// longer re-applies a filter predicate when loading result metadata -- it
// only loads whatever locations the RPC actually returned.
export async function getSupabaseLocationsByIds(ids: readonly string[]): Promise<Location[]> {
  if (ids.length === 0) return [];
  const { data, error } = await getSupabaseClient().from("locations").select(LOCATION_SELECT).in("id", ids);
  if (error) throw dataAccessError("Failed to load locations by id", error);
  return mapRows(data as LocationRow[]);
}

export async function getSupabaseLocation(id: string): Promise<LocationDetail | null> {
  const { data, error } = await getSupabaseClient().from("locations")
    .select(LOCATION_SELECT)
    .eq("id", id).maybeSingle();
  if (error) throw dataAccessError(`Failed to load location ${id}`, error);
  if (!data) return null;
  const { location, warnings } = toLocation(data as LocationRow);
  logRowWarnings(location.id, warnings);
  return location;
}

// RPC response -> LocationSearchResult[], shared by searchSupabaseLocations
// and getSupabaseSimilarLocations. Location metadata is loaded only for the
// IDs the RPC actually returned (getSupabaseLocationsByIds), never by
// re-running a filter query -- so there is nothing app-side left to keep in
// sync with the RPC's own filter_region/filter_category/exclude_location_id.
// getSupabaseLocationsByIds does not guarantee row order matches the RPC's
// similarity order; that's fine because groupImageMatches/rankLocationImageHits
// (Member 1's utility) re-sorts by similarity itself and only uses the
// `locations` array as an id -> metadata lookup (verified in
// supabase-repository.test.ts).
async function resolveRankedResults(data: unknown): Promise<LocationSearchResult[]> {
  let rows;
  try {
    rows = parseMatchLocationImagesRows(data);
  } catch (parseError) {
    throw dataAccessError("Unexpected match_location_images response shape", parseError);
  }
  const matches: ImageMatch[] = rows.map(toImageMatch);
  const locationIds = [...new Set(matches.map((match) => match.locationId))];
  const locations = await getSupabaseLocationsByIds(locationIds);
  return groupImageMatches(matches, locations, 8);
}

export async function searchSupabaseLocations(
  embedding: number[],
  filters: LocationFilter = {},
  options: SearchQueryOptions = {},
): Promise<LocationSearchResult[]> {
  const { data, error } = await getSupabaseClient().rpc("match_location_images", {
    query_embedding: embedding,
    match_threshold: options.threshold ?? SEARCH_MATCH_THRESHOLD_DEFAULT,
    match_count: options.count ?? SEARCH_MATCH_COUNT_DEFAULT,
    filter_region: filters.region ?? null,
    filter_category: filters.category ?? null,
    expected_embedding_model: EXPECTED_EMBEDDING_MODEL,
  });
  if (error) throw dataAccessError("Failed to search location images", error);
  return resolveRankedResults(data);
}

// TODO(similar-locations-embedding): no existing utility (Member 1's or
// otherwise) defines how to pick/combine a location's own embedding(s) for
// similar-locations search -- location-ranking.ts and group-image-matches.ts
// both operate on an already-produced hit list. Simplest reasonable choice
// pending Member 1 input: the location's oldest location_images row (by
// created_at, then id) with a non-null embedding matching the server's
// expected model/revision. An averaged/pooled embedding across a location's
// images is a plausible alternative; see docs/search-ranking.md.
//
// Selects the raw column rather than going through supabase-mappers because
// pgvector values round-trip through supabase-js/PostgREST as their text
// literal ("[0.1,0.2,...]"), which can be forwarded as-is into the next
// RPC's vector parameter -- verified directly against a disposable
// Postgres+PostgREST stack; no JS-side float parsing needed or done.
async function getSupabaseRepresentativeEmbedding(locationId: string): Promise<string | null> {
  const { data, error } = await getSupabaseClient()
    .from("location_images")
    .select("embedding")
    .eq("location_id", locationId)
    .eq("embedding_model", EXPECTED_EMBEDDING_MODEL)
    .not("embedding", "is", null)
    .order("created_at")
    .order("id")
    .limit(1)
    .maybeSingle();
  if (error) throw dataAccessError(`Failed to load a representative embedding for location ${locationId}`, error);
  return (data as { embedding: string } | null)?.embedding ?? null;
}

export async function getSupabaseSimilarLocations(locationId: string): Promise<LocationSearchResult[]> {
  const representativeEmbedding = await getSupabaseRepresentativeEmbedding(locationId);
  // No usable embedding (no images, or none from the currently expected
  // model) -- an empty result, not an error.
  if (!representativeEmbedding) return [];
  const { data, error } = await getSupabaseClient().rpc("match_location_images", {
    query_embedding: representativeEmbedding,
    match_threshold: SEARCH_MATCH_THRESHOLD_DEFAULT,
    match_count: SEARCH_MATCH_COUNT_DEFAULT,
    expected_embedding_model: EXPECTED_EMBEDDING_MODEL,
    // Excluded in SQL, not by filtering the RPC's response in JS afterward:
    // the query vector is one of this location's own images, so its other
    // images are near-guaranteed to dominate the raw top-match_count
    // candidates. Removing them after the fact could starve the result the
    // same way the old app-side region/category filter did (see
    // docs/search-ranking.md).
    exclude_location_id: locationId,
  });
  if (error) throw dataAccessError(`Failed to search similar locations for ${locationId}`, error);
  return resolveRankedResults(data);
}
