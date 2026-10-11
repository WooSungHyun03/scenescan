# Independent ticket verification — 2026-10-12 (KST)

Scope: 15 original tickets restored from the three existing team documents and Git history. Their original nationwide counts/paths predate the Busan domain migration. Status below follows current source and executed evidence, not completion claims. The former noise ticket is superseded by the explicit removal requirement.

| Original ticket | Status | Independent evidence / remaining acceptance gap |
| --- | --- | --- |
| 김진석: photographic retrieval evaluation | PARTIAL | Existing evaluator runs, but committed labelled corpus remains synthetic; Top-1 41.7% on 12 authored policy cases is not real-photo quality. No threshold tuning or invented photographic ground truth. |
| 김진석: search API scope/contract optimization | BROKEN | Metadata hydration uses only returned IDs and bounded SQL ranking; real unfiltered query returns eight Busan locations. Production district image query returns 503 because model/district RPC schema is not deployed. |
| 김진석: CLIP lifecycle/cancellation | PASS | Worker correlation/timeout/crash/cancellation tests, actual Production WASM inference, and new image/text cancel → ignore late response → retry browser regressions. This is not a physical-device WebGPU/heap benchmark. |
| 김진석: bounded initial browse | PARTIAL | Server/client fetch bounded pages; no whole-catalog initial render. Filter/pagination state is not encoded in a shareable URL; transient in-tab restoration is not reload/URL restoration. |
| 김진석: diverse similar locations | PARTIAL | Client passes seen IDs and handles exhaustion; unit/mock browser coverage exists. Hosted model-safe pre-LIMIT exclusion RPC remains pending; legacy overfetch cannot guarantee completeness at scale. |
| 김태권: per-image attribution | PARTIAL | Shared types/mappers/UI and all metadata manifests validate; hosted attribution is displayed. Full remote schema rollout and broken-link/license revalidation for every served source are not established by a few page checks. |
| 김태권: balanced dataset | PARTIAL | 223 source rows / 36 Busan, but actual hosted Busan catalog is 13. All hosted aliases/tags empty; one district null. Source additions are not proof of imported/embedded production coverage. |
| 김태권: permit provenance/contacts | PARTIAL | Reviewed contacts plus conservative transient Kakao suggestions implemented. Address false positives corrected. Representative numbers never imply filming approval; most sites still lack verified filming procedures/contacts. |
| 김태권: static parking import | BLOCKED | Collector/import/validators and local DB tests exist; hosted static parking has zero rows. Dedicated authorized provider credential/data and reviewed collection are still needed. Live Kakao candidates are a separate feature, not completion of static import. |
| 김태권: expected noise sources | PASS (superseded) | Current source/UI has no noise feature. Historical migrations retained for replay; later migration removes it. Do not reintroduce the retired ticket. |
| 한호형: security patch/boundaries | PASS | Next 16.3.8, prod audit no known vulnerabilities, security-header configuration, RLS/Auth tests and client-secret scan. New KMA errors discard untrusted provider messages/codes/transport causes; this does not claim all future vulnerabilities absent. |
| 한호형: browser E2E | PASS | 59 mock browser tests, local Auth/Mailpit flow, actual Production CLIP/search/Kakao/health smoke; provider failures are reported separately. |
| 한호형: clean-clone validation | PASS | Fresh local clone of main, offline frozen-lockfile install, metadata validation (223 rows), embedding validate-only (284), schema audit (30 checks), production build all passed without ignored local assets or secrets. |
| 한호형: visual/responsive/accessibility | PASS | Existing visual system retained; home card shift fixed and tested at 768/1440px. 320/390/768/1440 overflow/touch/focus/reduced-motion flows pass. No claim of a comprehensive physical-device accessibility certification. |
| 한호형: location-time solar/light | PASS | Explicit Korea-local conversion, timezone/DST/date/heading tests and browser timezone regressions. New date-only sunrise/sunset display uses installed SunCalc and handles missing events. |

Totals: PASS 7 (including one superseded removal), PARTIAL 6, BROKEN 1, MOCK-ONLY 0, MISSING 0, BLOCKED 1. New NVIDIA/weather/contact requirements were inspected separately from these original 15 tickets.

## Production and data evidence

- Read-only catalog: 13 Busan rows, 12 classified districts, no populated tags/aliases; static parking zero; `location_images.embedding_model` lookup returns 42703 (column missing).
- Stored-vector test: `/api/search` unfiltered HTTP 200 / eight Busan results (679ms in one sample); `busan_haeundae_gu` HTTP 503 / `DATA_UNAVAILABLE` (168ms). This is an RPC diagnostic, not a browser inference measurement.
- All 261 remote image IDs/owners exist in the reviewed embedding file, but no stored vector exactly matches its q8 record at Float32 precision. Direction cosine min/median/max: 0.950482 / 0.993442 / 0.997759. Similarity is not provenance: do not label existing rows q8 or run a blind model backfill. Reconcile model/data versions or explicitly regenerate/import licensed source images first.
- Production text `해운대`: 200, two registered DB results, 10.083s; `광안대교가 보이는 장소`: 200, zero, 14.674s. Both executions explicitly reported rules fallback, not NVIDIA success. Credentials/provider congestion and metadata quality remain separate concerns.
- Real browser smoke: cold-model request observed, actual CLIP → eight results → eight Kakao markers → health passed; 12.8s test duration. This is not Recall@K or p95 performance.

## Executed checks

- lint/typecheck/build, 134 suites / 861 unit tests, client-bundle secret boundary; metadata validation and production dependency audit. The address matcher also rejects explicitly conflicting districts despite identical street/building tokens.
- 59 mock browser regressions (including cancellation, sunrise/sunset and fixed home layout), local Auth account-isolation/recovery/deletion flow, and 25 local database/RLS integration tests.
- No production rows, Auth accounts, DNS, provider credentials or RLS policies were changed. No destructive migration or guessed contact/data import was performed. Post-push CI/deployment status is verified separately rather than assumed from these local results.
