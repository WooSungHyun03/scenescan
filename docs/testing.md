# Test suite overview

`pnpm test` runs every `*.test.ts` unit test (`vitest.config.ts`) -- no Supabase project, no environment variables, no network. `pnpm test:e2e` runs the Playwright browser regressions in key-free mock mode. `pnpm test:integration` runs every `*.integration.test.ts` file (`vitest.integration.config.ts`) against a live Supabase instance; see [integration testing](integration-testing.md) for setup. CI (`.github/workflows/ci.yml`) runs lint, type checking, unit tests, a standalone build/container smoke test, and the browser E2E suite on every PR; it does not run `pnpm test:integration` (that needs a live Supabase instance CI doesn't provision).

## Browser E2E (`pnpm test:e2e` -- key-free mock mode)

Install Chromium once with `pnpm exec playwright install chromium`, then run `pnpm test:e2e`. The local command starts Next.js on port 3110 with mock data, mock AI, and no Kakao key. Set `PLAYWRIGHT_BASE_URL` to reuse an already-running app instead.

The suite reuses `scripts/embeddings/evaluation-images/queries/demo-01-query.png`, a project-created MIT-licensed asset. It covers home, file chooser and drag/drop upload, preview/delete/invalid image, filters, Top 8, search-result map markers, detail/no-key map fallback, solar date/time, camera heading/lighting, localStorage shortlist comparison, retryable DB error, empty results, key-free login/signup/account/recovery protection, callback open-redirect/expiry/token-stripping behavior, and responsive 320/390/768/1440 px flows. CI builds the Docker `e2e` target and runs this same suite against the key-free standalone `runner` container; it does not download CLIP, call Supabase, or load the Kakao SDK.

## Local Auth E2E (`pnpm test:e2e:auth` -- local Supabase + Mailpit)

Run `pnpm supabase:start` first, then `pnpm test:e2e:auth`. The dedicated Playwright config reads only the well-known loopback public values from `.env.integration.example`, starts the app on port 3111, and reads the local Mailpit preview at `http://127.0.0.1:54324`; it never needs a production project or SMTP credential. The suite creates a unique test user and verifies confirmation-required signup, pre-confirmation login rejection, resend cooldown, email-link callback, refresh persistence, shared browser-context tabs, logout/login, non-enumerating recovery, a clean token-free recovery URL, new-password login with old-password rejection, and current-password reauthentication on `/account/security`. Local users remain in the disposable local Auth database until `pnpm supabase:stop`; no cleanup uses an admin credential from the browser. Full setup and the production owner checklist are in [Auth email setup](auth-email-setup.md).

This suite is intentionally not part of the key-free Docker PR job because that job does not start the full Supabase stack. Callback expiry and open-redirect blocking still run in the default key-free E2E suite and unit tests. Production email delivery is not claimed by local Mailpit: configure and verify production SMTP, templates, Site URL, and redirect URLs separately.

## Production smoke (`pnpm test:e2e:production` -- real external services)

`.github/workflows/production-smoke.yml` is separate from PR/push CI and runs only on manual dispatch or once each week. Each run calls `/api/health`, performs exactly one real browser CLIP search with the same project-owned evaluation image, requires 1-8 results, and then requires a real Kakao map with at least one marker. This deliberately avoids broader crawling, repeated searches, or retries that would consume Vercel/Supabase free-tier usage.

Set the optional GitHub repository variable `PRODUCTION_BASE_URL` to override `https://beceleb.org`. If Vercel Deployment Protection is enabled, store its automation bypass value only as the `VERCEL_AUTOMATION_BYPASS_SECRET` repository secret; the test sends it only to the production origin and never writes it to diagnostics. Failures are classified as `external-outage`, `model-cold-load`, `flaky-timeout`, or `product-regression`. The failed run uploads its screenshot, video, trace, HTML report, and sanitized diagnostic JSON for seven days.

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
| `src/infrastructure/supabase/{browser-auth-client,request-auth-client,auth-proxy,auth-verification}.test.ts` | keyless mock mode, per-tab browser singleton, request-scoped server clients, refresh/expiry, forged cookies, simultaneous-tab isolation, verified claims/getUser identity matching, and private cache headers |
| `src/domains/users/services/*.test.ts`, `src/app/auth/{callback,recovery}/route.test.ts` | auth input/error mapping, timestamp-only resend/recovery cooldowns, safe internal redirects, purpose-separated PKCE/token-hash callbacks, expired/used links, token stripping, cookie forwarding, and private response caching |
| `src/proxy.test.ts` | Next.js 16 proxy matcher covers application/API requests and skips static assets |
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
