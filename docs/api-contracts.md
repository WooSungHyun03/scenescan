# Shared contracts

The source of truth for TypeScript shapes is `src/types/domain.ts` and `src/types/contracts.ts`. Change these and this document together.

| Operation | Input | Output | Owner |
| --- | --- | --- | --- |
| `ImageEmbeddingService.embed` | `File \| Blob`, optional `{ signal, timeoutMs }` | `Promise<number[]>`, finite length 512 | Member 1 |
| `searchByImage` / `POST /api/search` | `{ embedding: number[512], filters?: LocationFilter, threshold?: number }` | `{ results: LocationSearchResult[] }`, maximum 8 (unchanged) | Member 3 with 1 |
| `getLocations` | `LocationListQuery` (`LocationFilter` + optional `limit`/`offset`) | `Location[]` | Member 3 |
| `getLocation` | string ID | `LocationDetail \| null` | Member 3 |
| `getSimilarLocations` / `GET /api/locations/[id]/similar` | path param `id` (uuid) | `{ results: LocationSearchResult[] }`, maximum 8 | Member 3 with 1 |
| `getSolarPosition` | `GeoPoint`, JavaScript `Date` | `SolarPosition` (degrees) | Member 4 |

`LocationFilter`: optional `region` (`서울`, `부산`, `인천`, `경기`) and `category` (`urban`, `nature`, `industrial`, `interior`). `POST /api/search` request validation (`searchRequestSchema`, Zod, `src/types/contracts.ts`) rejects: an `embedding` whose length isn't exactly 512, any non-finite value (`NaN`/`Infinity`) or non-number in it, an all-zero vector, an unrecognized `region`/`category`, and `threshold` outside `[0, 1]`. Unknown top-level or `filters` fields (including a client-supplied `count`, see below) are silently ignored (Zod's default "strip" behavior) rather than rejected -- matching every other schema already in this file (`locationFilterSchema`, `locationListQuerySchema`); `scripts/data`/`scripts/embeddings`'s import-time schemas use `.strict()` instead, which is a deliberate difference for a different concern (malformed *stored* data must fail loudly), not an inconsistency to fix here. The request body is also capped at `MAX_SEARCH_REQUEST_BYTES` (32KB) before it ever reaches `JSON.parse` (checked via `Content-Length` first, then the actual decoded byte length -- see `src/app/api/search/route.ts`).

`threshold` is an optional pre-aggregation candidate-retrieval knob only (`SearchQueryOptions`, `src/types/domain.ts`) -- it maps to the `match_location_images` RPC's `match_threshold` (or the equivalent filter in mock mode). It does **not** change the result count: that stays fixed at up to 8 locations, a separate, non-configurable product policy (see `docs/search-ranking.md`). Server default when omitted: 0 (`SEARCH_MATCH_THRESHOLD_DEFAULT`, `src/types/contracts.ts`). `match_count` (the RPC's candidate-window size, `SEARCH_MATCH_COUNT_DEFAULT` = 200) is **not** client-configurable -- an earlier revision of this endpoint accepted a `count` field; it was removed from the public request schema (there was no product need for a client to widen/narrow the server's own candidate window) and is now always the fixed server constant, for both plain search and similar-locations. See `src/types/contracts.ts`'s comment for why 200 (the RPC's ceiling) is the right default rather than a smaller "typical" number.

`similarity` is cosine similarity in real mode and a synthetic UI value in mock mode. Images are grouped by location using the highest image score, then sorted by descending similarity and ascending location ID for deterministic ties. Duplicate images and malformed scores are excluded (Member 1's ranker, unchanged). Region/category eligibility is now decided entirely by the RPC's `filter_region`/`filter_category` (real mode) or by filtering mock candidates before grouping (mock mode) -- there is no longer a separate app-side "is this location in my already-filtered list" check layered on top; see the RPC section below for why this matters.

## Errors

Every error response is `{ error: { code, message }, requestId }`. `message` is always a Korean, user-safe sentence -- never the underlying Supabase/Postgres error text, a stack trace, SQL, or an environment variable value; those are logged server-side only (`src/shared/observability/logger.ts`), and even there, request embedding vectors and secrets are never included. This is a breaking shape change from the previous flat `{ error: string, code, requestId }` response; no current frontend code reads `code` or `error` from a failed response body (`SearchWorkspace` only checks `response.ok`), so nothing else needed to change to stay compatible.

| `code` | HTTP status | Meaning |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Malformed JSON, failed request validation, or an oversized body |
| `LOCATION_NOT_FOUND` | 404 | A requested location does not exist. Returned by `GET /api/locations/[id]/similar` for a well-formed but nonexistent id. (`src/app/locations/[id]/page.tsx` still uses Next's `notFound()` directly -- it is a Server Component, not this HTTP route.) |
| `DATA_UNAVAILABLE` | 503 | The server could not reach the data it needed -- missing Supabase configuration or a live DB/RPC failure. Both collapse to this one public code; the client has no use for the internal distinction |
| `SEARCH_FAILED` | 500 | Any other unexpected failure during search |

`src/shared/errors/application-error.ts` provides one constructor per code (`validationError`, `notFoundError`, `configurationError`/`dataAccessError`, and the `toApplicationError` catch-all that produces `SEARCH_FAILED`) rather than a new parallel error system -- `apiErrorResponse` (`src/shared/http/api-error-response.ts`) is the single place that turns any of them into the JSON shape above.

`LocationListQuery` (`src/types/domain.ts`) extends `LocationFilter` with optional `limit`/`offset` for `getLocations` only -- search and similar-location results are never paginated (always up to 8). Default `limit` is 20, capped at 50 (`LOCATION_LIST_DEFAULT_LIMIT`/`LOCATION_LIST_MAX_LIMIT` in `src/types/contracts.ts`); `offset` defaults to 0. `locationListQuerySchema` (same file) validates and rejects negative/non-integer/over-limit values for a future HTTP route; both `getMockLocations` and `getSupabaseLocations` additionally clamp defensively (never throwing) via `resolveLocationListPagination` in `src/domains/locations/server/pagination.ts`, so a caller that bypasses validation still can't exceed the cap. No HTTP route lists locations today (Server Components call `getLocations` directly per the note below), so this schema currently has no caller. Both `getMockLocations` and `getSupabaseLocations` order results by `name` with `id` as an explicit tiebreaker, required for `limit`/`offset` pagination to be stable across calls.

`getLocation` never throws for a missing image or parking row on an otherwise-valid location: `src/domains/locations/server/supabase-mappers.ts`'s `toLocation` drops any image/parking sub-row missing a required field (id, image_url, or for parking name/latitude/longitude), returning it in a separate `warnings` array that the repository logs via `logger.warn` instead of failing the request. Solar position is not part of `LocationDetail` and is never read from or computed by the repository -- `SolarPosition` is computed entirely client-side by `getSolarPosition` (Member 4) from `location.point` and a user-selected time (see `src/domains/locations/components/solar-panel.tsx`).

`ImageEmbeddingService` also exposes `getStatus()` and `subscribe(listener)`. Status is one of `idle`, `loading`, `ready`, or `error`; loading status can include progress from 0 to 100. Both mock and real modes accept JPEG, PNG, and WebP inputs with the limits documented in `docs/architecture.md`. The default inference timeout is 120 seconds.

Supabase RPC (see `docs/search-ranking.md` for the full contract and a reproducible filter regression test):

```sql
match_location_images(
  query_embedding extensions.vector(512),
  match_threshold double precision default 0,
  match_count integer default 40,
  filter_region text default null,
  filter_category text default null,
  expected_embedding_model text default null,
  exclude_location_id uuid default null
)
-- rows: image_id uuid, location_id uuid, image_url text, similarity double precision
```

`filter_region`/`filter_category` are applied inside the query (joined against `locations`), not by the caller afterward -- this replaces an earlier version of the RPC that had no filters, which could hide a matching location if its images fell outside the raw top-`match_count` nearest neighbors. `expected_embedding_model` must match `location_images.embedding_model` exactly; a null value matches zero rows (fail closed), so every caller must pass it. `src/domains/locations/server/supabase-repository.ts` passes `filter_region`/`filter_category`/`expected_embedding_model` on every call (the earlier `TODO(search-filter-sql)` gap is closed); it then loads `Location` metadata only for the exact IDs the RPC returned (`getSupabaseLocationsByIds`), rather than re-running a region/category filter query -- there is nothing left to keep in sync between the two.

The RPC response is validated at runtime against `matchLocationImagesRowSchema` (`src/domains/locations/server/supabase-mappers.ts`, Zod) before being mapped and handed to Member 1's ranking utility -- an unexpected shape (wrong types, non-UUID IDs, a non-array response) throws a `dataAccessError` naming the RPC instead of failing with an opaque `TypeError` deep inside the ranker.

## `GET /api/locations/[id]/similar`

Returns locations similar to the given location, using one of that location's own stored image embeddings as the query vector -- the client never supplies a vector for this endpoint. Response shape is `{ results: LocationSearchResult[] }`, identical to `POST /api/search`'s (this is also what `src/app/locations/[id]/page.tsx` already renders via `getSimilarLocations`, in mock mode, so the shape is not new -- only the real-mode implementation is).

- **Path param `id`**: must be a syntactically valid uuid (`locationIdSchema`, `src/types/contracts.ts`) -- 400 `VALIDATION_ERROR` otherwise, checked independently of mock/real mode. Mock fixture ids are fixed UUIDs (`src/domains/locations/fixtures/locations.ts`; the old `demo-01`-style names survive only as each fixture's `slug`, used for its `public/images/demo-0N.svg` file), so this route works end-to-end in mock mode too -- e.g. `GET /api/locations/00000000-0000-4000-8000-000000000001/similar` returns 200 with mock data.
- **Nonexistent id**: 404 `LOCATION_NOT_FOUND`.
- **Location exists but has no usable embedding** (no `location_images` row, or none matching the server's expected model): `{ results: [] }` with a 200 status -- not an error, indistinguishable from "found candidates but none passed threshold".
- **Self-exclusion**: the target location's own images are excluded via the RPC's `exclude_location_id`, not by filtering the RPC's response afterward -- see the RPC section above and `docs/search-ranking.md` for the regression this avoids.
- **Result limit**: up to 8, the same fixed policy as plain search (not separately configurable).
- **Ordering**: descending `similarity`; row order from the DB is not relied upon (`groupImageMatches`/`rankLocationImageHits`, Member 1's ranker, re-sorts by similarity itself -- verified in `supabase-repository.test.ts`).

API pages currently call repositories directly on the server for read-only listing/detail. Add a route only when a client needs an HTTP contract -- `GET /api/locations/[id]/similar` is the first one, so this new route's existence does not mean `getLocation`/`getLocations` need HTTP routes yet too.
