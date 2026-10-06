# Integration testing

`pnpm test` (unit, `vitest.config.ts`) never needs Supabase and must keep passing with zero environment variables set -- that's what "works in mock, breaks against real Supabase" is checking for in the first place. `pnpm test:integration` (`vitest.integration.config.ts`) is the separate suite that runs the same kind of scenarios against a real, migrated Postgres/Supabase instance. Every `*.integration.test.ts` file is excluded from `pnpm test` and only collected by `pnpm test:integration`.

## Why Supabase CLI, not a hand-built Docker container

Earlier work on this project verified individual migrations against disposable `pgvector/pgvector` Postgres containers, sometimes fronted by a standalone `postgrest/postgrest` container plus a hand-signed JWT and a small path-rewriting proxy (supabase-js always calls `<url>/rest/v1/...`, which bare PostgREST doesn't serve at its root). That worked, but had two real gaps:

1. **No `storage` schema.** The `location-images` Storage bucket migration (`supabase/migrations/20260929010000_location_images_storage_bucket.sql`) could never be applied or checked that way -- `storage.buckets`/`storage.objects` are a Supabase-platform feature, not part of plain Postgres.
2. **A different, non-representative grant model.** Manually running `grant select on all tables in schema public to anon, authenticated;` (and nothing else) is not what real Supabase actually provisions. Real Supabase's platform bootstrap grants `anon`/`authenticated` *every* table privilege by default and relies entirely on RLS policies to restrict access. That difference is not cosmetic: it changes what a blocked write actually looks like (see `docs/database.md`'s "RLS verification" -- this was discovered, and the docs corrected, while building this test suite against the real CLI).

`npx supabase@latest` works without any global install or Homebrew tap (confirmed directly in this environment) and `supabase start` runs the actual Supabase stack -- including `storage` -- via Docker, applying every file in `supabase/migrations/` the same way a real project's migration deploy would. That made it the clear choice over maintaining a second, subtly-different manual Docker setup: it verified a real bug (the RLS behavior above) that the hand-built setup had been silently papering over.

## Running

```bash
pnpm supabase:start   # first run pulls several GB of images; keep it running across test runs
cp .env.integration.example .env.integration.local   # or export the same four variables in your shell
set -a; source .env.integration.local; set +a
pnpm test:integration
pnpm supabase:stop    # when done
```

`pnpm supabase:start` applies every migration in `supabase/migrations/` in order and prints the local `API_URL`/`ANON_KEY`/`SERVICE_ROLE_KEY` (`.env.integration.example` already has copies of the well-known defaults for a project that hasn't customized `supabase/config.toml`'s `[auth].jwt_secret`). If a migration fails, `supabase start` itself fails with the SQL error -- that's the first, cheapest integration check, before any test file even runs.

Every integration test file starts with `describe.skipIf(!getIntegrationEnv())` (`supabase/tests/integration-env.ts`): with any of the four variables missing, the whole file is skipped (shown as `↓` in Vitest's output), not failed. Running `pnpm test:integration` with no local Supabase running is safe and intended to just skip everything -- confirmed directly.

Test files share one live database and run sequentially (`fileParallelism: false` in `vitest.integration.config.ts`) rather than in Vitest's default parallel worker processes, because some assertions are necessarily table-wide (e.g. "this RPC call with no filter matches nothing") and were observed to intermittently fail from cross-file interference under parallel execution before this was set.

## What's covered

| File | Covers |
| --- | --- |
| `supabase/tests/schema-and-rls.integration.test.ts` | All three tables reachable via anon SELECT; anon INSERT rejected outright; anon UPDATE/DELETE against a real row silently no-op (row provably unchanged, read back via the service role) -- see `docs/database.md` for why these are different mechanisms; `match_location_images` executable by anon; Storage bucket RLS (anon upload denied, service upload succeeds, resulting object is publicly readable) |
| `supabase/tests/match-location-images.integration.test.ts` | `filter_region` regression (a location outside a dominant cluster's raw top-N is still returned); `exclude_location_id` regression (a location's own dominant images don't starve its own similar-locations search); `expected_embedding_model` fail-closed (mismatched model excluded, omitted parameter matches nothing) |
| `src/domains/locations/server/supabase-repository.integration.test.ts` | `getSupabaseLocations`/`getSupabaseLocation`/`searchSupabaseLocations`/`getSupabaseSimilarLocations` against real data, with a same-shape spot-check against the equivalent mock-repository call |
| `supabase/tests/user-shortlist.integration.test.ts` | Two-user RLS isolation, wrong-owner rejection, duplicate/idempotent merge, deleted-location cascade, and second-device reads through the real authenticated client |
| `scripts/data/import.integration.test.ts` | The real `runImport` CLI entry point: `--dry-run` writes nothing, `--apply` run twice with identical input does not duplicate the location or parking row |

Everything above was, earlier in this project's history, verified by hand once and then discarded (ad-hoc Docker containers, curl commands, hand-signed JWTs). It's now reproducible and re-run on demand instead of trusted from memory.

## What's intentionally not covered here

- Full HTTP-level API tests (`POST /api/search`, `GET /api/locations/[id]/similar`) against a *running Next.js server* in real mode -- those routes were verified manually against this same kind of stack while building them (see the reports for those changes), but this suite tests at the repository layer (the boundary between this project's code and Supabase), which is the more usual integration-test scope and doesn't require booting the whole Next app inside a test run. If HTTP-level real-mode coverage becomes worth the added complexity, `supabase start`'s printed `API_URL`/keys are already exactly what a real-mode `next start` would need.
- `scripts/embeddings/*` (Member 1's pipeline) -- out of scope for this backend-owned suite.

## CI boundary

`.github/workflows/ci.yml` starts this stack in the `Local Auth, Mailpit, and RLS` job for pull requests and `main` pushes. The job loads only `.env.integration.example` loopback defaults, applies all migrations, runs this integration suite, and then runs the local Auth/Mailpit browser flow. It never reads repository Production secrets, sends real email, calls the KMA provider, runs real CLIP inference, or targets a hosted Supabase project. The stack is stopped with `--no-backup` even after a failure, and browser diagnostics are uploaded only on failure.

## 마지막 확인

- 날짜: 2026-10-01
- `pnpm supabase:start`: migration 에러 없이 기동 (`supabase/migrations/**` 전체 적용 성공, 이 자체가 첫 검증).
- `pnpm test:integration`: **4개 파일, 14개 테스트 전부 통과**, 946ms.
- `pnpm supabase:stop`으로 정리 완료.
