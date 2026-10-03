# Test suite overview

`pnpm test` runs every `*.test.ts` unit test (`vitest.config.ts`) -- no Supabase project, no environment variables, no network. `pnpm test:integration` runs every `*.integration.test.ts` file (`vitest.integration.config.ts`) against a live Supabase instance; see [integration testing](integration-testing.md) for setup. CI (`.github/workflows/ci.yml`) runs `pnpm lint`, `pnpm typecheck`, and `pnpm test` on every PR; it does not run `pnpm test:integration` (that needs a live Supabase instance CI doesn't provision).

## Unit tests (`pnpm test` -- no Supabase needed)

### Backend-owned (`src/domains/*/server`, `src/app/api`, `src/shared`, `src/types`, `src/infrastructure`, `scripts/data` import path, `scripts/shared`)

| File | Covers |
| --- | --- |
| `src/domains/locations/server/supabase-mappers.test.ts` | DB row -> `Location` mapping (normal/missing image or parking/null optional fields); `match_location_images` RPC row schema (well-formed, missing/null response, malformed shape, similarity boundaries `-1`/`1`, out-of-range similarity intentionally not rejected here) |
| `src/domains/locations/server/supabase-repository.test.ts` | `getSupabaseLocations`/`getSupabaseLocation`/`searchSupabaseLocations`/`getSupabaseSimilarLocations` against a mocked Supabase client: pagination clamping, region/category `.eq()`/RPC-parameter wiring, orphan sub-row warnings, RPC parse-error mapping, exclude/threshold/count parameter passthrough, result order independent of DB row order, mock/real contract parity spot-checks |
| `src/domains/locations/server/mock-repository.test.ts` | Same operations against fixture data: filtering, deterministic ordering, region-filter-drops-higher-similarity-hit regression, threshold filtering, similar-locations self-exclusion |
| `src/domains/locations/server/pagination.test.ts` | `resolveLocationListPagination` clamp boundaries (default, oversized, negative, non-integer) |
| `src/app/api/search/route.ts` -> `route.test.ts` | 200 response shape, embedding length/NaN/string/all-zero -> 400, disallowed region -> 400, invalid JSON -> 400, body-size cap (Content-Length and actual byte length) -> 400, repository `DATA_UNAVAILABLE`/unexpected throw -> 503/500 without leaking internal detail, `count` silently ignored |
| `src/app/api/locations/[id]/similar/route.ts` -> `route.test.ts` | Non-uuid/empty id -> 400, nonexistent id -> 404, empty-result 200, self-exclusion in the response, repository failure -> mapped error without leaking detail (repository mocked away) |
| `src/app/api/locations/[id]/similar/route.mock-mode.test.ts` | Same route with the **real** mock repository wired in (not mocked) -- 200 for a real fixture id, 404 for a nonexistent one; the reason mock fixture ids are fixed UUIDs |
| `src/app/api/health/route.test.ts` | Static health response shape |
| `src/domains/search/server/validation.ts` -> `validation.test.ts` | Zod-error-to-Korean-message mapping for every `searchRequestSchema` field, threshold inclusive boundaries (0/1), never echoes raw Zod issue text |
| `src/shared/errors/application-error.test.ts` | Each error constructor's code/status/public message; cause message never leaks into `publicMessage` |
| `src/shared/http/api-error-response.test.ts` | `{ error: { code, message }, requestId }` shape; underlying cause never in the response body |
| `src/types/contracts.test.ts` | Shared Zod schemas (owned jointly, see file) |
| `scripts/shared/supabase-admin-client.test.ts` | Service-role env validation: rejects a `NEXT_PUBLIC_*`-named key, requires both vars, requires HTTPS unless localhost |
| `scripts/data/location-importer.ts` -> `location-importer.test.ts` | locations/parking row mapping, missing-id/duplicate-id guards, validate-only/dry-run/apply counts, locations-before-parking ordering, batch-size bounds |
| `scripts/data/import.ts` -> `import.test.ts` | CLI arg parsing, validate-only run against real files (report written, invalid record skipped + others still processed, refuses to overwrite input) |

### Member 1-owned (`src/lib/ai`, `src/domains/locations/services` ranking/aggregation, `scripts/embeddings`) -- reused, not modified

`src/lib/ai/*.test.ts` (embedding validation/worker/image-validation/mock-and-real embedding services/vector-math/index), `src/domains/locations/services/{location-ranking,group-image-matches}.test.ts`, `scripts/embeddings/*.test.ts` (contracts/importer/import/pipeline/prepare/schema-audit). Not itemized here -- see those files directly; this project's convention throughout has been to extend/reuse this code, not restate its own test coverage in backend docs.

### Member 4-owned (`scripts/data` normalize/validate path) -- reused, not modified

`scripts/data/{category-mapping,normalizer,normalize,permit-information,validate,validator}.test.ts`. Same note as above.

## Integration tests (`pnpm test:integration` -- needs a live Supabase instance)

See [integration testing](integration-testing.md) for the full "what's covered" table and setup instructions.
