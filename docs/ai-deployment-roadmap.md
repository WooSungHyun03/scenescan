# AI / Deployment roadmap

This is the progress source of truth for Member 1. A checkbox is complete only after implementation and verification. Dates use Korea Standard Time.

Current environment note (2026-09-20): the default `pnpm build` Turbopack path is blocked on this host because its CSS helper cannot bind an internal port (`EPERM`). The supported `next build --webpack` production fallback completed successfully, including TypeScript, static generation, and route tracing. This is an execution-environment blocker, not a source/build error; recheck the default builder in CI or an unrestricted host.

## DAY 1 — Real CLIP Inference

Status: complete (2026-09-20)

- [x] Audit all current AI source and preserve the browser-worker architecture.
- [x] Verify model ID `Xenova/clip-vit-base-patch32` against the installed Transformers.js pipeline.
- [x] Verify actual output shape `[1, 512]` and finite values with a real model run.
- [x] Verify browser image → Web Worker → CLIP → `/api/search` flow with real AI mode.
- [x] Reject NaN, Infinity, and dimension mismatches inside the worker and again at the main-thread boundary.
- [x] Surface image decode failures as request-scoped errors.
- [x] Reject all pending work on a worker crash and allow worker recreation.
- [x] Correlate concurrent requests by request ID, including out-of-order completion.
- [x] Preserve deterministic, finite, normalized mock embeddings.
- [x] Define observable `idle` / `loading` / `ready` / `error` model state.
- [x] Add focused model runtime, service, validation, and mock regression tests.

Verification:

- Actual model tensor: `[1, 512]`; 512/512 values finite.
- Browser smoke test: real Web Worker inference completed and mock repository returned Top 8.
- Decode regression: SVG input produced a user-visible decode error without breaking the page.

## DAY 2 — Worker / Input Reliability

Status: complete (2026-09-20)

- [x] Support only JPEG, PNG, and WebP at the AI boundary.
- [x] Limit encoded input to 15 MB.
- [x] Limit decoded input to 8192 px per axis and 20 megapixels.
- [x] Handle corrupt and unsupported images without leaking pending tasks.
- [x] Share one embedding service and one lazily created worker.
- [x] Share one model initialization promise inside the worker.
- [x] Prevent duplicate initialization under concurrent requests.
- [x] Clean pending state, timers, and abort listeners on every terminal path.
- [x] Apply a 120-second default timeout with a per-request override.
- [x] Retry interrupted requests once after a worker crash.
- [x] Terminate and recreate failed, timed-out, or cancelled idle workers.
- [x] Publish aggregate model download progress when available.
- [x] Support request cancellation with `AbortSignal`.
- [x] Test 25 rapid, out-of-order requests and mock-mode regression.

Verification:

- Focused AI suite: 36 tests passed on 2026-09-20.
- Browser page load and real inference: no framework error overlay or console error.

## DAY 3 — Offline Embedding Pipeline

Status: complete (2026-09-21)

- [x] Define and validate manifest fields: `location_id`, `image_id`, `source`, `source_url`, and local image path.
- [x] Validate image type, size, decoded dimensions, and source metadata.
- [x] Reuse the exact runtime CLIP model and preprocessing contract.
- [x] Emit finite 512-D embeddings with model/version metadata.
- [x] Add configurable batching.
- [x] Add resumable, idempotent output.
- [x] Add failed-item retry without duplicating completed records.
- [x] Guarantee deterministic ordering and validate malformed vectors.
- [x] Add focused tests and usage documentation.

Verification:

- Real model run: two synthetic PNGs processed in one batch; 2/2 completed, zero failures.
- Output: `Xenova/clip-vit-base-patch32`, revision `main`, Transformers.js `4.3.0`, two finite 512-D vectors.
- Resume run: 2/2 records resumed with no model initialization or inference.
- Deterministic resume: output SHA-256 remained `41e4f0f341802424cf20efb97f4569a9b3dd619fdbf4e97e9674988bd7152d95`.
- Automated suite after DAY 3 implementation: 48 tests passed.

## DAY 4 — Supabase pgvector Integration

Status: not started

- [ ] Verify pgvector extension and `vector(512)` schema.
- [ ] Review foreign keys, indexes, and RLS with the backend/data owners.
- [ ] Add a controlled import/upsert workflow with duplicate prevention.
- [ ] Reject invalid vectors and keep service-role credentials server-only.
- [ ] Verify cosine RPC threshold, count, empty-data, and malformed-query behavior.
- [ ] Run real integration checks when credentials/data are available.
- [ ] Document migration and import operations.

## DAY 5 — Search Ranking

Status: not started

- [ ] Verify raw image-hit grouping and max-similarity aggregation.
- [ ] Implement and evaluate top-k mean as a pure alternative.
- [ ] Guarantee deterministic ordering, deduplication, and tie handling.
- [ ] Handle missing metadata and orphan image records.
- [ ] Verify threshold, empty results, and Top 8 enforcement.
- [ ] Add tests and document the selected aggregation default.

## DAY 6 — Similar Locations

Status: not started

- [ ] Implement `getSimilarLocations` with the backend owner.
- [ ] Exclude the selected location and remove duplicates.
- [ ] Define representative embedding and Top-K behavior.
- [ ] Handle missing embeddings and unknown IDs.
- [ ] Evaluate reference blending only if evidence justifies it.
- [ ] Add tests and confirm API contract consistency.

## DAY 7 — Retrieval Evaluation

Status: not started

- [ ] Create an authorized or synthetic multi-category evaluation set.
- [ ] Record expected matches and failure cases.
- [ ] Implement Top-1, Top-3, and Top-5/Recall@K evaluation.
- [ ] Compare max similarity, top-k mean, and thresholds.
- [ ] Record qualitative examples without unsupported tuning.
- [ ] Create `docs/ai-retrieval-evaluation.md` and select final settings.

## DAY 8 — AI Performance

Status: not started

- [ ] Benchmark initial load and repeated inference.
- [ ] Measure worker and preprocessing overhead.
- [ ] Confirm lazy loading, caching, and duplicate-init prevention.
- [ ] Check repeated-use memory behavior.
- [ ] Evaluate WebGPU capability without making it mandatory.
- [ ] Preserve WASM/CPU fallback, cancellation, and timeout behavior.
- [ ] Add regression tests and benchmark documentation.

## DAY 9 — CI

Status: not started

- [ ] Add GitHub Actions checkout, Node 22, and pnpm setup.
- [ ] Use frozen lockfile install and dependency caching.
- [ ] Run lint, typecheck, test, and build with clear failures.
- [ ] Apply minimum permissions, concurrency cancellation, and timeout.
- [ ] Validate workflow syntax and document CI in README.

## DAY 10 — Environment / Secret Security

Status: not started

- [ ] Inventory and classify all public and server-only environment variables.
- [ ] Validate Supabase, Kakao, and mock-mode configuration.
- [ ] Provide clear missing-environment errors.
- [ ] Prevent server-only imports and secrets from entering browser bundles.
- [ ] Search for committed keys, tokens, passwords, and credentials.
- [ ] Audit production bundle exposure.

## DAY 11 — Production Deployment

Status: not started

- [ ] Verify Vercel Hobby build, Node, pnpm, and environment settings.
- [ ] Verify Supabase migrations, pgvector, RLS, RPC, and licensed sample data.
- [ ] Run a production build and deploy when credentials are available.
- [ ] Smoke-test home, search, detail, API, and real AI search paths.
- [ ] Record external credential blockers without blocking local work.

## DAY 12 — Production Reliability

Status: not started

- [ ] Test AI network, download, worker, corruption, browser, and repetition failures.
- [ ] Test Supabase outage, timeout, RPC error, empty DB, and invalid payload behavior.
- [ ] Test broken image URLs and missing metadata/embeddings.
- [ ] Preserve structured errors without changing frontend design.

## DAY 13 — Open Source Reproducibility

Status: not started

- [ ] Verify clean clone, install, environment, and development instructions.
- [ ] Verify Supabase migration, embedding preparation/validation/import, build, and deploy steps.
- [ ] Remove stale commands, missing dependencies, and undocumented environment variables.
- [ ] Verify model/dataset licenses, attribution, and `DATA_LICENSES.md`.

## DAY 14 — Final Production Audit

Status: not started

- [ ] Audit AI inference, worker lifecycle, validation, concurrency, errors, and performance.
- [ ] Audit embedding generation, resume, validation, import, and version consistency.
- [ ] Audit pgvector, Top 8, aggregation, similar locations, and evaluation.
- [ ] Audit CI, Vercel, Supabase, environment security, and production behavior.
- [ ] Search `TODO|FIXME|HACK|XXX` and remove only confirmed dead or duplicate code.
- [ ] Run the complete quality suite and final production smoke checks.
