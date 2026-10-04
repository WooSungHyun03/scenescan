# Release verification — 2026-10-04 (KST)

Baseline: main `993317b`, after pulling the team's changes. Untracked personal
ticket documents were inspected but not edited or staged. No production data
was deleted, no paid service was enabled, and no unknown-license data was scraped.

## Ticket verification

| Area | Result/evidence |
| --- | --- |
| Upload, drag/drop, preview, Top 8, filters, mock switching | PASS in browser E2E; bounded browse integration was REGRESSION and repaired |
| Worker, request IDs, singleton, MIME/dimensions, cancel/retry | PASS; cancellation-post exceptions and stale worker status repaired |
| Real CLIP / offline model compatibility | PASS runtime finite 512D; offline import now supplies centralized model key and rejects incompatible dtype |
| SQL search filtering, ranking, metadata lookup | PASS against migrated local Supabase; exact matched-ID hydration retained |
| Similar exploration | PARTIAL → repaired: compatible-model average, distinct locations before LIMIT, seen-ID exclusion and honest exhaustion |
| Gallery/provenance, permit, static parking/noise | PASS code contracts; legacy migrated noise and shortlist parking relation repaired; unknown facts remain unknown |
| Solar and camera direction | REGRESSION → repaired: explicit Korean shooting instant shared by detail/comparison, strict calendar validation |
| Browse pagination / shortlist | REGRESSION → repaired: HTTP bounded reads and explicit saved-ID resolution; legacy invalid IDs cannot poison a batch |
| Next security patch / env boundary / CI / Docker | Next 16.3.8, audit and client-bundle checks PASS; CI HTTP Docker hostname/CSP conflict reproduced and fixed using loopback |
| Production and retrieval quality | PARTIAL: operational schema drift detected, production smoke before deployment fails at search 503; synthetic evaluation does not prove quality for real reference photos |

## Additional repairs

- Stop reading oversized request bodies during streaming at 32KB, rather than
  buffering the complete body and checking afterward.
- Apply bounded Supabase, search, similar-list and Kakao SDK waits, preserving
  abort signals and the no-key/failure map preview.
- Recommendation failure no longer prevents viewing otherwise-valid detail;
  malformed route UUIDs are 404 instead of database failures.
- Reject invalid location category/region/coordinates and unsafe image URLs;
  unregistered external image hosts cannot crash Next Image cards.
- Browse UI distinguishes pending/failed/empty reads and partial loaded counts.
  Already seen similar candidates are not presented as new recommendations.

## Verification evidence

- Frozen-lockfile install; lint/typecheck; **407 unit tests / 71 files** pass.
- Local migrated Supabase: **16 integration tests / 4 files** pass, including
  anonymous-write denial, Storage access, filters and model/seen-ID exclusion.
  Only isolated test fixtures were created and cleaned up locally.
- Approved metadata: **200 locations, zero validation errors**; embedding
  validate-only: **261 records**. No production write performed for these checks.
- Default Turbopack production build and standalone Docker build pass. Docker
  runs as `nextjs` (UID 1001) and health status is `healthy`.
- **7 browser E2E tests pass** in development and production Docker mock mode:
  core flow, drag/drop, invalid/empty/error/retry, mobile, off-page filtering,
  explicit saved-ID resolution, legacy ID and external-image failure.
- Detail at **320/390/768/1440px**: no horizontal overflow, no broken loaded
  images and no page errors. Desktop/mobile screenshots inspected.
- Production Docker, real AI + mock catalog: WASM **one worker**, two finite
  **512-D** outputs. First wall time **9021ms**, model wait **8442ms**, inference
  **347ms**; repeated wall time **301ms**, model wait **0ms**, inference **199ms**.
  These are single-host samples, not a population benchmark or real-data recall.
  One earlier cold-load attempt exceeded the timeout; retry succeeded. Timeout
  and loading/error recovery remain necessary, not evidence of universal latency.
- Post-push Vercel deployment of `f3ca375`: READY. Public home/search/shortlist
  and region-filter listing respond successfully. Real CLIP → production search
  returns **HTTP 200 / Top 8** (before the fix it returned 503). The smoke then
  exposed missing `data-map-mode` on real multi-marker maps; that adapter path
  is repaired and covered by SDK lifecycle tests, not misreported as a key outage.
- `pnpm audit --prod --audit-level high`: no known vulnerabilities;
  `pnpm security:client-bundle`: PASS. Only example environment files are tracked.

## External rollout limits

Production DB lacks `location_images.embedding_model` and the current model-safe
RPC signatures. An exact PGRST202 compatibility path preserves the existing
five-argument SQL-filtered search. It is temporary and cannot certify mixed-model
safety. Apply reviewed pending migrations in timestamp order (through
`20261004000002_model_safe_similar_search.sql`) before final model-isolation claims.
The service-role REST key is not a DDL/management credential. The logged-in
dashboard bridge was unavailable during this audit; no production DDL was
attempted through an unsupported method.

The read-only MVP intentionally has no user Auth or transactional email flow;
Supabase Auth/Resend are not fabricated as completed product features. A valid
Kakao browser key/domain registration and post-deployment real-data smoke remain
external verification requirements. Existing data/image rights are preserved.
