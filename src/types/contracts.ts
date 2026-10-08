import { z } from "zod";
import type { Location, LocationFilter, LocationListQuery, LocationSearchResult } from "./domain";
import { DISTRICT_VALUES, LOCATION_CATEGORY_VALUES, REGION_VALUES } from "./location-options";

// POST /api/search body size cap. 512 finite-number JSON floats run at most
// a few KB (worst case ~20 bytes/value including a leading "-", full
// precision, and a separator -> well under 12KB); filters/threshold/count
// add negligible overhead. 32KB leaves generous headroom without allowing a
// multi-MB body to reach JSON.parse. Enforced in src/app/api/search/route.ts
// by checking Content-Length up front and re-checking the actual decoded
// text length before parsing (Content-Length can be absent or wrong).
export const MAX_SEARCH_REQUEST_BYTES = 32 * 1024;

// DELETE /api/account accepts no identity selector. The authenticated user
// is resolved server-side and this exact phrase is an intentional,
// destructive-action confirmation rather than a generic boolean checkbox.
export const ACCOUNT_DELETION_CONFIRMATION = "회원탈퇴";
export const ACCOUNT_DELETION_CSRF_HEADER = "x-scenescan-csrf";
export const ACCOUNT_DELETION_CSRF_VALUE = "account-delete-v1";
export const MAX_ACCOUNT_DELETION_REQUEST_BYTES = 2 * 1024;

// Authenticated shortlist writes use an idempotent desired-state contract.
// Identity never comes from the body; the API resolves it from the verified
// request session and RLS independently enforces the same owner boundary.
export const SHORTLIST_WRITE_CSRF_HEADER = "x-scenescan-csrf";
export const SHORTLIST_WRITE_CSRF_VALUE = "shortlist-write-v1";
export const MAX_SHORTLIST_REQUEST_BYTES = 16 * 1024;
export const SHORTLIST_IMPORT_MAX_ITEMS = 200;

export const accountDeletionRequestSchema = z.object({
  currentPassword: z.string().min(8).max(72),
  confirmation: z.literal(ACCOUNT_DELETION_CONFIRMATION),
}).strict();

export const locationFilterSchema = z.object({
  // DEPRECATED: see the REGION_VALUES comment in location-options.ts. Only
  // "부산" validates; kept so an old stored client session/URL doesn't 400.
  region: z.enum(REGION_VALUES).optional(),
  district: z.enum(DISTRICT_VALUES).optional(),
  category: z.enum(LOCATION_CATEGORY_VALUES).optional(),
});

// GET /api/locations validates bounded listing with this schema. The
// repository additionally clamps defensively (see
// resolveLocationListPagination in
// src/domains/locations/server/pagination.ts) so a direct, non-HTTP caller
// can't bypass the cap either. Explicit ID reads are separately capped at 50.
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

// POST /api/search/text body size cap. A single natural-language query
// capped at TEXT_SEARCH_QUERY_MAX_LENGTH UTF-16 code units, plus the
// trivial `{"query":"..."}` JSON wrapper, stays well under 2KB even at
// worst-case 4-byte astral emoji. Enforced the same streamed-read way as
// MAX_SEARCH_REQUEST_BYTES -- see src/app/api/search/text/route.ts.
export const MAX_TEXT_SEARCH_REQUEST_BYTES = 2 * 1024;
export const TEXT_SEARCH_QUERY_MAX_LENGTH = 200;

// `.trim()` before `.min()`/`.max()` so a whitespace-only query 400s as
// blank (zod issue code "too_small") rather than passing length checks and
// silently becoming an empty keyword list -- see describeTextSearchRequestError
// (src/domains/search/server/validation.ts), which maps "too_small"/"too_big"
// to distinct Korean messages. Same `.trim().min(1)` idiom scripts/data/contracts.ts
// already uses for `nonEmptyString`.
export const textSearchRequestSchema = z.object({
  query: z.string().trim().min(1).max(TEXT_SEARCH_QUERY_MAX_LENGTH),
}).strict();

export type TextSearchRequest = z.infer<typeof textSearchRequestSchema>;

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

export const shortlistMutationRequestSchema = z.object({
  locationId: locationIdSchema,
  saved: z.boolean(),
}).strict();

export const shortlistMergeRequestSchema = z.object({
  locationIds: z.array(locationIdSchema).max(SHORTLIST_IMPORT_MAX_ITEMS),
}).strict();

export const shortlistResponseSchema = z.object({
  ids: z.array(locationIdSchema),
}).strict();

export const shortlistMergeResponseSchema = shortlistResponseSchema.extend({
  mergedCount: z.number().int().nonnegative(),
  ignoredCount: z.number().int().nonnegative(),
}).strict();

export type SearchRequest = z.infer<typeof searchRequestSchema>;
export type AccountDeletionRequest = z.infer<typeof accountDeletionRequestSchema>;
export type ShortlistMutationRequest = z.infer<typeof shortlistMutationRequestSchema>;
export type ShortlistMergeRequest = z.infer<typeof shortlistMergeRequestSchema>;
export type ShortlistResponse = z.infer<typeof shortlistResponseSchema>;
export type ShortlistMergeResponse = z.infer<typeof shortlistMergeResponseSchema>;
export interface AccountDeletionResponse {
  deleted: true;
}
export interface SearchResponse {
  results: LocationSearchResult[];
}

export interface LocationListResponse {
  locations: Location[];
  filters: LocationFilter;
}

export interface SimilarLocationsResponse {
  results: LocationSearchResult[];
}
