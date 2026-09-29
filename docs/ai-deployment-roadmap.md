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

Status: complete (remote integration verified 2026-09-29)

- [x] Verify pgvector extension and `vector(512)` schema.
- [x] Review foreign keys, indexes, and RLS against the committed backend migration.
- [x] Add a controlled validate/dry-run/apply upsert workflow with duplicate prevention.
- [x] Reject invalid and zero-norm vectors and keep service-role credentials server-only.
- [x] Verify cosine normalization utilities, RPC bounds in SQL, empty result handling, and malformed query rejection locally.
- [x] Run real integration checks with server-only credentials and authorized location rows.
- [x] Document migration and import operations.

Verification:

- Static migration audit: 12 checks passed for pgvector, vector dimension, keys/index/RLS, RPC cosine semantics, threshold/count bounds, and invoker rights.
- Import preflight tests cover missing locations, cross-location UUID replacement, duplicate URL, unresolved failure, zero norm, invalid RPC similarity, dry-run no-write behavior, and apply batching.
- Search request validation rejects non-finite, wrong-dimension, and all-zero query vectors before RPC execution.
- Automated suite after local DAY 4 implementation: 62 tests passed.
- Production (2026-09-29): 159 licensed locations and 209 image rows imported; all 209 rows contain finite 512-D CLIP embeddings.
- Real `match_location_images` and `match_similar_location_images` probes each returned eight finite results. Runtime image URLs resolve through the public `location-images` Supabase Storage bucket.
- The nationwide region constraint and partial cosine HNSW index were applied through `20260929000000_scale_location_catalog.sql`.

## DAY 5 — Search Ranking

Status: complete (2026-09-23)

- [x] Verify raw image-hit grouping and max-similarity aggregation.
- [x] Implement and behaviorally compare top-k mean as a pure alternative.
- [x] Guarantee deterministic ordering, deduplication, and tie handling.
- [x] Handle missing metadata and orphan image records.
- [x] Verify threshold, empty results, and Top 8 enforcement.
- [x] Add tests and document the selected aggregation default.

Verification:

- Max aggregation preserves the strongest image per location and remains the production default.
- Synthetic comparison `A=[1.0, 0.1]`, `B=[0.8, 0.7]` ranks A first with max and B first with top-2 mean; this validates behavior only, not retrieval quality.
- Ties resolve by ascending location ID and then image ID, independent of input order.
- Duplicate images are collapsed before aggregation; blank IDs, non-finite/out-of-range scores, and orphan locations are excluded.
- Inclusive threshold, empty candidates, filtered-empty metadata, default Top 8, and source immutability have regression coverage.
- Top-k mean remains evaluation-only until DAY 7 provides authorized-dataset evidence.
- Local Node 22 diagnostic benchmark: 200 image hits / 50 locations, 10,000 warmed max-ranking iterations in 152.03 ms (0.0152 ms/iteration); this is not a browser or retrieval-quality benchmark.
- Automated suite after DAY 5 implementation: 72 tests passed; lint, typecheck, and webpack production build passed.

## DAY 6 — Similar Locations

Status: complete, including production activation (2026-09-29)

- [x] Implement `getSimilarLocations` through the existing repository contract.
- [x] Exclude the selected location and remove duplicates.
- [x] Define representative embedding and Top-K behavior.
- [x] Handle missing embeddings and unknown IDs.
- [x] Evaluate reference blending only if evidence justifies it.
- [x] Add tests and confirm API contract consistency.

Verification:

- Representative query: mean of every non-null CLIP image embedding for the selected location; cosine distance is used for candidates.
- SQL and application layers both exclude the selected location. Max-per-location aggregation, Top 8, malformed/orphan removal, and deterministic ties reuse the production ranker.
- Mock and Supabase adapters cover unknown IDs, no embeddings, duplicate candidates, RPC failures, and source exclusion.
- Migration audit covers representative `vector(512)`, invoker rights, public execute grant, bounded threshold/count, source exclusion, and deterministic order; 20 schema checks pass across all migrations.
- Production RPC is deployed and returns eight results while excluding the source location; the 159-location catalog has embeddings for all 209 image rows.
- Reference + selected-location blending remains disabled until DAY 7 supplies retrieval evidence.

## DAY 7 — Retrieval Evaluation

Status: complete for the authorized synthetic baseline (2026-09-29); production photographic relevance remains a documented data limitation

- [x] Create an authorized or synthetic multi-category evaluation set.
- [x] Record expected matches and failure cases.
- [x] Implement Top-1, Top-3, and Top-5/Recall@K evaluation.
- [x] Compare max similarity, top-k mean, and thresholds.
- [x] Record qualitative examples without unsupported tuning.
- [x] Create `docs/ai-retrieval-evaluation.md` and select final settings.

Verification:

- Real `Xenova/clip-vit-base-patch32` run: 20/20 finite 512-D embeddings for ten MIT-licensed candidate/query pairs; 100% Top-1/3/5 and Recall@1/3/5 on the synthetic transform regression set.
- Correct-pair cosine range: 0.966855–0.977649; Top-1 margins: 0.000624–0.012440. These narrow margins confirm the same-template set is regression evidence, not production relevance evidence.
- Twelve balanced ranking scenarios compare max and top-2 mean at thresholds 0, 0.5, and 0.75. Top-2 mean/0 reached 50.0% Top-1 versus max/0 at 41.7%, but both reached 100% Top-3/5; the curated set does not justify changing production.
- Threshold 0.75 reduced macro Recall@3/5 to 70.8% and produced 8.3% empty results. Production stays at max, threshold 0, Top 8; blending stays disabled.
- Focused evaluation and ranking suites validate malformed data, duplicate IDs, missing images/embeddings, multi-answer recall, empty threshold results, deterministic output, and model provenance.

## DAY 8 — AI Performance

Status: in progress (offline and cache-warm production browser baselines recorded; cold-download and heap device matrix remain)

Preliminary baseline (not a browser result): with the model already present in the local Hugging Face cache, a fresh Node 22 process loaded the production CLIP pipeline and embedded the 20-image evaluation set in five batches of four in 1.75 seconds wall time. Peak RSS was 830,912 KB. The generated score file SHA-256 was `a0aa27ae6de76e99307e5fbfece7143412129a8c0d0dc467c310753ec36239ec`. DAY 8 remains open until cold browser loading, repeated worker inference, preprocessing overhead, memory behavior, WebGPU capability, and fallback paths are measured separately.

- [ ] Benchmark first-visit network/model load; cache-warm Worker initialization and repeated inference are recorded.
- [x] Add bounded worker decode/model-wait/inference and main-thread overhead measurements.
- [x] Confirm lazy loading, caching, and duplicate-init prevention.
- [ ] Check repeated-use memory behavior.
- [ ] Evaluate WebGPU capability without making it mandatory.
- [x] Preserve explicit WASM fallback, cancellation, and timeout behavior.
- [x] Add regression tests and benchmark documentation.

Production browser verification (2026-09-30): a new Worker with model files already cached completed the full image-to-Top-8 flow in 3,334 ms. Five same-Worker searches took 2,168/1,947/1,952/2,266/1,955 ms (2,058 ms mean; 1,955 ms median), returned 선유도공원 first at 88%, and emitted no console warning/error. See `docs/ai-performance.md`. Cold network load and browser heap remain explicitly unverified.

## DAY 9 — CI

Status: complete (2026-09-29)

- [x] Add GitHub Actions checkout, Node 22, and pnpm setup.
- [x] Use frozen lockfile install and dependency caching.
- [x] Run lint, typecheck, test, and build with clear failures.
- [x] Apply minimum permissions, concurrency cancellation, and timeout.
- [x] Validate workflow syntax and document CI in README.

Verification: GitHub Actions run `36521957799` passed the Docker-based lint, typecheck, 160-test suite, standalone build, production image build, and container smoke checks in 3m44s with read-only permissions, a 25-minute timeout, dependency/build caching, and concurrency cancellation.

## DAY 10 — Environment / Secret Security

Status: not started

- [ ] Inventory and classify all public and server-only environment variables.
- [ ] Validate Supabase, Kakao, and mock-mode configuration.
- [ ] Provide clear missing-environment errors.
- [ ] Prevent server-only imports and secrets from entering browser bundles.
- [ ] Search for committed keys, tokens, passwords, and credentials.
- [ ] Audit production bundle exposure.

## DAY 11 — Production Deployment

Status: complete (2026-09-29)

- [x] Verify Vercel Hobby build, Node, pnpm, and environment settings.
- [x] Verify Supabase migrations, pgvector, RLS, RPC, and licensed sample data.
- [x] Run a production build and deploy when credentials are available.
- [x] Smoke-test home, search, detail, API, and real AI search paths.
- [x] Record external credential blockers without blocking local work.

Verification: Vercel deployed commit `edc063a` in 38 seconds and assigned `beceleb.org`. Production returned 200 for health/home/search/detail, loaded Kakao Maps and Supabase Storage images, returned eight finite RPC results, and completed a real browser CLIP search with the matching location ranked first. No credential blocker remains; Resend/Auth are intentionally absent because the MVP has no email/auth flow.

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
