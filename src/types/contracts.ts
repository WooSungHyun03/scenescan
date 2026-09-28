import { z } from "zod";
import type { Location, LocationFilter, LocationListQuery, LocationSearchResult } from "./domain";

// POST /api/search body size cap. 512 finite-number JSON floats run at most
// a few KB (worst case ~20 bytes/value including a leading "-", full
// precision, and a separator -> well under 12KB); filters/threshold/count
// add negligible overhead. 32KB leaves generous headroom without allowing a
// multi-MB body to reach JSON.parse. Enforced in src/app/api/search/route.ts
// by checking Content-Length up front and re-checking the actual decoded
// text length before parsing (Content-Length can be absent or wrong).
export const MAX_SEARCH_REQUEST_BYTES = 32 * 1024;

export const locationFilterSchema = z.object({
  region: z.enum(["서울", "부산", "인천", "경기"]).optional(),
  category: z.enum(["urban", "nature", "industrial", "interior"]).optional(),
});

// Not currently used by any HTTP route (getLocations is called directly from
// Server Components today, per docs/architecture.md) -- this is the
// validation layer a future "list locations" route should run before
// calling getLocations, rejecting negative/non-integer/over-limit values
// outright. The repository additionally clamps defensively (see
// resolveLocationListPagination in
// src/domains/locations/server/pagination.ts) so a direct, non-HTTP caller
// can't bypass the cap either.
export const LOCATION_LIST_DEFAULT_LIMIT = 20;
export const LOCATION_LIST_MAX_LIMIT = 50;

export const locationListQuerySchema = locationFilterSchema.extend({
  limit: z.number().int().positive().max(LOCATION_LIST_MAX_LIMIT).optional(),
  offset: z.number().int().nonnegative().optional(),
}) satisfies z.ZodType<LocationListQuery>;

// match_threshold/match_count bounds for the match_location_images RPC (see
// supabase/migrations/20260928010000_match_location_images_filters.sql).
// SEARCH_MATCH_COUNT_DEFAULT is the RPC's absolute ceiling, not a smaller
// "typical" number: with an unmeasured, possibly uneven images-per-location
// distribution in a still-small dataset, a lower default risks the
// candidate window being dominated by one location's many images and
// under-filling the 8-location result. Vector-scan cost at this dataset
// size is negligible (docs/database.md), so there is no offsetting reason
// to default lower. Revisit once a real dataset's images-per-location shape
// is measured (see docs/search-ranking.md).
//
// match_count itself is NOT client-configurable (see searchRequestSchema
// below) -- it is always this fixed server constant, for both plain search
// and similar-locations. There is no product need for a client to widen or
// narrow the server's own candidate-retrieval window; only match_threshold
// is exposed.
export const SEARCH_MATCH_THRESHOLD_DEFAULT = 0;
export const SEARCH_MATCH_COUNT_DEFAULT = 200;

export const searchRequestSchema = z.object({
  embedding: z.array(z.number().finite()).length(512).refine(
    (embedding) => embedding.some((value) => value !== 0),
    "Embedding must have a non-zero norm",
  ),
  filters: locationFilterSchema.default({}),
  // Pre-aggregation candidate-retrieval knob only -- see SearchQueryOptions
  // in src/types/domain.ts. Optional; SEARCH_MATCH_THRESHOLD_DEFAULT applies
  // when absent. `count`/match_count is deliberately not part of this
  // public request shape -- see the comment on SEARCH_MATCH_COUNT_DEFAULT.
  threshold: z.number().min(0).max(1).optional(),
});

// A real locations.id path/route param (uuid primary key -- see
// supabase/migrations/20260920000000_initial_schema.sql). Used by
// GET /api/locations/[id]/similar. Mock fixture ids
// (src/domains/locations/fixtures/locations.ts) are fixed UUIDs for exactly
// this reason -- they satisfy this schema too, so this route works
// end-to-end in mock mode without a special case.
// getLocation/getSimilarLocations (src/domains/locations/server/
// repository.ts) still accept any string directly when called from a
// Server Component, as they always have; this schema only gates the HTTP
// route.
export const locationIdSchema = z.string().uuid();

export type SearchRequest = z.infer<typeof searchRequestSchema>;
export interface SearchResponse {
  results: LocationSearchResult[];
}

export interface LocationListResponse {
  locations: Location[];
  filters: LocationFilter;
}
