# Backend security checklist

Point-in-time results of a backend security review against `feat/backend-supabase` (2026-10-01). Supersedes `docs/security-audit-context.md`, whose "실제 구현 상태" table (written 2026-09-27) is now stale in several places -- see "docs/security-audit-context.md와의 차이" below. Each item here was verified directly (code read, local `supabase start` + `pnpm test:integration`, or a one-off command), not carried over from the old doc.

## 1. HTTP attack surface (what's actually reachable)

| Route | Auth | Input validation | Error leakage |
|---|---|---|---|
| `POST /api/search` | none (public) | `src/types/contracts.ts` `searchRequestSchema`: embedding must be exactly 512 finite numbers, not all-zero; `filters.region`/`filters.category` are closed enums; body size capped at `MAX_SEARCH_REQUEST_BYTES` (checked via `Content-Length` first, then actual decoded byte length, before `JSON.parse`) | `apiErrorResponse` returns only `{code, publicMessage}`; raw Supabase error (`cause`) and stack never reach the client -- verified by `route.test.ts`'s "maps ... without leaking internal detail" cases, which assert the response body does not contain the injected column name |
| `GET /api/locations/[id]/similar` | none (public) | `locationIdSchema` (`z.string().uuid()`) rejects non-UUID ids with 400 `VALIDATION_ERROR` before calling any repository (`route.test.ts`: "400s a non-uuid id ... without calling the repository") | Same `apiErrorResponse` contract; nonexistent-but-well-formed id returns 404 `LOCATION_NOT_FOUND`, not a DB error; a repository throw maps to 500 `SEARCH_FAILED` without leaking the underlying message (tested) |
| `GET /api/health` | none (public) | no input | static JSON, nothing to leak |

**Response size cap**: both `searchSupabaseLocations` and `getSupabaseSimilarLocations` funnel through `resolveRankedResults`, which calls `groupImageMatches(matches, locations, 8)` -- grouped results are hard-capped at 8 locations regardless of the RPC's raw `match_count` (200). Confirmed in `supabase-repository.ts:103` and exercised by `route.test.ts`'s "returns up to 8 results" case.

**Location list/detail** (`getLocations`/`getLocation`) have no API route -- called directly from Server Components, per `docs/api-contracts.md`. Not an HTTP-reachable surface today.

## 2. RLS and Storage policy

Source of truth: `supabase/migrations/20260920000000_initial_schema.sql` (tables) and `supabase/migrations/20260929010000_location_images_storage_bucket.sql` (bucket). All three tables (`locations`, `location_images`, `parking`) have RLS enabled with **only a SELECT policy** for `anon, authenticated`; no INSERT/UPDATE/DELETE policy exists anywhere, so those default-deny. The Storage bucket has the identical shape: public bucket, SELECT-only policy for `anon, authenticated`, no write policy -- writes only via the service role, which bypasses RLS.

This is exercised end-to-end by `supabase/tests/schema-and-rls.integration.test.ts` against a real local Supabase instance (re-ran this session, see §5):
- anon SELECT succeeds on all three tables.
- anon INSERT is rejected outright (`WITH CHECK` failure).
- anon UPDATE/DELETE against a real seeded row silently affects zero rows (Postgres's implicit `USING (false)` for a missing policy, not a thrown error) -- verified via a service-role read-back proving the row is unchanged.
- `match_location_images` RPC is callable by anon (`security invoker` + base `EXECUTE` grant).
- Storage: anon upload to `location-images` is rejected; service-role upload succeeds and the resulting object is publicly readable at its public URL.

The INSERT/UPDATE/DELETE mechanism was only exercised directly against `locations`; `location_images`/`parking` use byte-for-byte identical policy statements (same migration, same pattern), so this generalizes rather than needing a second independent test -- flagged here rather than silently assumed.

**No gap found.** No new test was added; existing integration coverage already matches what was asked ("anon 읽기 가능, 쓰기 불가").

## 3. Secret handling

- `scripts/shared/supabase-admin-client.ts`: throws before doing anything if `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` is set (catches the class of mistake where a service-role key gets the client-bundle prefix); requires `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`; enforces HTTPS unless the host is `localhost`/`127.0.0.1`. Never logs either value.
- `scripts/data/import.ts`: only `console.log`s record counts and validation summaries (`Location validation: total=..., valid=...`); never logs the client, env object, or any key. Confirmed by reading the full file -- no `console.log(process.env...)` or similar.
- `src/infrastructure/supabase/admin-client.ts` (Next.js-side equivalent): guarded by `import "server-only"`, so any Client Component import of it is a build-time error. Currently unused by any read path (real-mode reads use the anon-key client, matching what RLS expects).
- `src/shared/observability/logger.ts`: `error.stack` is included only when `NODE_ENV !== "production"`. `error.cause` (e.g. the Supabase error message) is logged unconditionally, but only to the server-side log sink (`console.error`) -- never echoed into the HTTP response (`api-error-response.ts` only serializes `{code, publicMessage}` to the client). No call site anywhere in `src/`/`scripts/` logs the request body, the embedding vector, or any key -- confirmed by grepping every `logger.*` call site; the only production call path is `api-error-response.ts`, which logs the `ApplicationError` wrapper, never the raw request.
- `.env.integration.example`: contains only the Supabase CLI's well-known, publicly documented local-development default JWTs (fixed `jwt_secret` every `supabase init` ships with), valid only against `127.0.0.1`. Not a real project's credentials. The file's own header comment says so.

## 4. Git history secret scan

Ran `gitleaks` (official Docker image, `zricethezav/gitleaks:latest`) against the full local history (`git` scan mode, 17 commits, ~726 KB):

```
docker run --rm -v "$(pwd)":/repo zricethezav/gitleaks:latest git /repo --no-banner -v --redact=0
```

Result: **2 findings, both false positives** -- the same two `.env.integration.example` JWT-shaped strings from §3 (lines 14 and 16, commit `8a37e2a`), flagged by gitleaks's generic `jwt` rule purely because they parse as JWTs. They are the public Supabase CLI local-dev defaults, not project secrets, and are intentionally committed (see `.env.integration.example`'s own comment and `docs/integration-testing.md`). No other finding. No real secret (service role key, API key, etc.) appears anywhere in history.

## 5. Docker image secret scan

Carried over from the prior session's Docker build/run verification (not re-run, per instruction):
- No `.env*` file of any kind inside the final `runner` image (`find / -iname '.env*'` → empty); the `builder` stage's intermediate layer has only `.env.example` (empty placeholder values, not secret, and never copied into `runner` anyway).
- No `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE`/`SECRET`-named environment variable set in the running container.
- No `SERVICE_ROLE` string anywhere in the built `.next` bundle.

## 6. Local Supabase re-verification this session

```
pnpm supabase:start   # migrations applied with no SQL error
pnpm test:integration # 4 files, 14 tests passed, 946ms
pnpm supabase:stop
```

No new integration test was added for this review -- §2's existing suite already covered every item this review's scope asked about (RLS write-deny, Storage read/write split). See `docs/integration-testing.md`'s "마지막 확인" section for the run this result is from.

## 7. Runtime version mismatch (local vs. Docker/CI)

- `.nvmrc`: `22`. `README.md`: "Use Node.js 22 and pnpm 10." Dockerfile: `node:22-bookworm-slim` in every stage. CI (`.github/workflows/ci.yml`) never runs on a host Node at all -- every step (lint/typecheck/test/build/smoke-test) runs *inside* the `ci`/`builder`/`runner` Docker targets, so CI is transitively pinned to Node 22 via the Dockerfile, not via a separate `actions/setup-node` version.
- This machine's active `node` is **26**, not 22 -- confirmed by `node -v`. Node 26 does not bundle Corepack (dropped in recent Node releases), so the repo's own `pnpm@10.18.3` (`packageManager` field) could not be invoked directly (`pnpm: command not found`); this review's commands used `npx pnpm@10.18.3 ...` as a workaround.
- `package.json` has **no `engines` field**, so nothing (npm/pnpm/CI) actually warns a contributor running the wrong Node version -- the README instruction is the only enforcement, and it's easy to miss.
- Risk is low for this codebase (no native addons, no Node-version-sensitive APIs observed), but the Corepack gap is a real local-dev papercut, not just a version-number mismatch.
- **Proposed, not applied** -- see "팀 결정 필요" below.

## 팀 결정 필요

- **`package.json`에 `"engines": { "node": "22.x" }` 추가**: Node 버전이 틀렸을 때 `npm`/`pnpm`이 경고하게 함. `package.json`은 공유 파일(`AGENTS.md`)이라 팀 합의 필요 -- 이번 점검에서는 적용하지 않음.
- **README에 한 줄 추가**: Node ≥25 사용자는 Corepack이 빠져 있어 `pnpm` 커맨드가 바로 안 뜬다는 점, `npx pnpm@<version>`으로 우회 가능하다는 점. 적용하지 않음.
- Dockerfile과 `.github/workflows/ci.yml`은 이미 Node 22로 올바르게 고정돼 있어 수정 대상이 아님(Member 1 소유, 변경 제안 없음).

## 8. `docs/security-audit-context.md`와의 차이 (낡은 부분)

That file was accurate as of 2026-09-27 but several of its "실제 구현 상태" claims no longer match the code:

| 항목 | 기존 문서 주장 | 실제 (지금 코드) |
|---|---|---|
| `getSimilarLocations` (real 모드) | "항상 빈 배열 반환 — 아직 미구현" | 구현됨: `getSupabaseSimilarLocations`가 위치의 대표 임베딩을 조회해 `match_location_images`를 `exclude_location_id`와 함께 호출. 임베딩이 없는 위치만 `[]` 반환 (에러 아님) |
| SQL 단계 metadata filtering | "미구현 — RPC가 top-200만 뽑고 앱에서 region/category 재필터링" | 구현됨: `filter_region`/`filter_category`가 RPC 파라미터로 직접 전달되고, 앱은 RPC가 반환한 ID만 `getSupabaseLocationsByIds`로 메타데이터 조회 (재필터링 없음) |
| 목록 조회 페이지네이션 | "limit/offset 없음" | 구현됨: `resolveLocationListPagination` + `.range()` (`pagination.ts`, 테스트 존재) |
| 에러 코드 체계 | "`BAD_REQUEST`, `CONFIGURATION_ERROR`, `DATA_ACCESS_ERROR`, `INTERNAL_ERROR` 4종류" | 실제 코드는 `VALIDATION_ERROR`, `LOCATION_NOT_FOUND`, `DATA_UNAVAILABLE`, `SEARCH_FAILED` — 이름 자체가 다름 |
| "세분화된 에러 코드 없음" (`LOCATION_NOT_FOUND` 등) | "미구현" | 구현됨, `/api/locations/[id]/similar`에서 사용 중 |
| 노출된 HTTP 엔드포인트 | "`/api/search`와 `/api/health` 뿐" | `GET /api/locations/[id]/similar`도 공개 라우트로 존재 |
| service-role 클라이언트 구조 | "`src/infrastructure`에 별도 모듈 없음" | `src/infrastructure/supabase/admin-client.ts`가 `server-only` 가드와 함께 존재 (현재 어떤 읽기 경로도 사용하지 않음) |

**제안**: `docs/security-audit-context.md`를 삭제하고 이 문서로 대체 — 삭제 전 사용자 확인 필요 (아직 삭제하지 않음).

## 9. 머지 전 확인 항목 (`feat/backend-supabase` → `main`)

- **[팀]** 실제 Supabase 프로젝트에 어떤 migration까지 적용됐는지 확인:
  ```bash
  npx supabase login
  npx supabase link --project-ref <project-ref>
  npx supabase migration list
  ```
  로컬 파일(9개, `20260920000000`~`20261001000005`)과 "Remote" 컬럼을 비교해 `20261001000000_location_attribution.sql` 이후 파일들이 아직 적용 안 됐는지 확인.
- **[팀]** 실제 DB에 migration을 먼저 적용한 뒤 PR을 머지한다 — 반대 순서(코드만 먼저 배포)로 하면 `embedding_model`/`match_location_images` 신호 시그니처가 없는 상태로 코드가 돌아 검색 자체가 깨진다.
- **[Member 1]** `scripts/embeddings/import.ts`가 `location_images` upsert 시 `embedding_model`을 명시적으로 넣는지 확인 (현재 안 넣음 — 기본값 제거 migration 때문에 신규 삽입은 `not_null` 위반으로 실패하도록 의도된 동작. §4/§7 참조).
- **[Member 1]** `scripts/data/production-importer.ts`도 동일한 문제가 있음을 확인 — `ImageMetadataRow`에 `embedding`/`embedding_model` 필드 자체가 없어, 이 스크립트로 재적재하면 같은 이유로 실패한다 (로컬에서 직접 재현 확인됨). 코드는 고치지 않음 — import.ts와 마찬가지로 의도된 fail-loud.
