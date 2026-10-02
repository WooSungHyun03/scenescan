# Search and data feasibility — 2026-10-02

## Release decision: retain image-only search

The production model is `Xenova/clip-vit-base-patch32`, revision `main`, Transformers.js 4.3.0, finite 512-D raw projected image output, WASM in a browser Worker. Model ID/revision/dimension/dtype are centralized; both browser and offline extraction explicitly use `q8`. Both pgvector and the evaluation cosine utility account for norms; no model/dimension/normalization change was made.

`scripts/embeddings/text-retrieval-probe.ts` tests five Korean prompts against English controls using the matching CLIP text projection, existing image vectors, and max-per-location Top 8. Run it with `node --experimental-strip-types scripts/embeddings/text-retrieval-probe.ts`; results remain under ignored `data-work`. This is a small qualitative experiment, not a labelled Recall@K benchmark.

On the original 159-place/209-image catalog, the Korean beach/factory/white-building/alley/rooftop prompts repeatedly favored 고신대학교, 청계산입구역, and 양재시민의숲역. English factory/alley controls surfaced 문화비축기지/감천문화마을, making missing data alone an inadequate explanation. The [upstream model card](https://huggingface.co/openai/clip-vit-base-patch32) documents English training limitations. The cold Node probe observed 64,509,031 extra text-weight bytes, 6,755 ms model load, and 316,837,888-byte process RSS; cached load was 352 ms. RSS is not browser heap or mobile memory. Do not ship poor Korean matching, silent English translation, image/text blending, or an extra browser download. The probe is never imported by UI/API; no paid API/GPU service/dependency was added.

## Catalog and source review

| Metric | Before | After |
| --- | ---: | ---: |
| Places / photos | 159 / 209 | 200 / 261 |
| Urban / nature / industrial / interior | 126 / 10 / 6 / 17 | 126 / 47 / 10 / 17 |
| First-level Korean regions | 17 | 17 |
| Places with 6 / 3 / 2 / 1 photos | 10 / 0 / 0 / 149 | 10 / 5 / 1 / 184 |

Discovery used official Wikidata/Commons APIs only. The fresh queue contained 391 review candidates; a blind expansion mostly added stations/schools and was not promoted. Explicit entity/region/category decisions prioritized parks, beaches, forests, lakes, waterfalls, and harbors. Source existence, coordinates, official P18 links, license allowlist, image size, stable UUIDs, name/proximity, source SHA-1, and local SHA-256 were checked. Additional approved views cover 해운대, 경포, 대천, 정방폭포, and 세종호수공원. The final 52 new photographs were inspected in browser contact sheets; two bird/crab photos and one helicopter photo were excluded despite valid licenses. Three already-staged rejected Storage objects remain unreferenced; they were not destructively deleted.

All 261 photos have original page/author/license metadata in production, with CC0/Public Domain/CC BY/CC BY-SA reuse gates and the attribution table in `data/production/IMAGE_LICENSES.md`. License assertions come from current Commons metadata, not inferred from filenames. No source/content hash duplicates or cosine-similarity >0.99 image pairs were found. The expansion initially retained all 209 original vectors exactly; subsequent real-browser verification exposed a pre-existing precision mismatch, so all 261 vectors were deliberately regenerated as q8 and reimported after validation. Image/place identities, published bytes, and operational place information were preserved. Metadata import used `--insert-only`; a source-field-only update filled previously missing credits without changing URL or permit/contact fields. The missing attribution migration was applied before import.

This is a discovery catalog, not a verified permission directory. Contacts stay null; permits require checking. Wikidata coordinates for large natural features may represent centroids rather than entrances. Four categories do not capture all shooting styles; 44/68 region-category cells remain under the three-place target. Interiors and multiple useful scene views remain the main quality gaps; licensed operational data, not DB space, is the limiting factor. Do not manufacture roofs, abandoned-building access, parking occupancy, noise dB, or phone numbers to fill them.

## Retrieval and capacity

The additive filtered RPC filters before limit, selects one best image per place, and orders deterministically. App-level Top 8 grouping remains unchanged; only matching place IDs are fetched instead of the full catalog. HNSW and legacy/similar RPCs are retained. No RLS/write privileges are widened. Filtered requests cannot silently fall back to the old global-200-image cap.

Post-expansion measurements from the actual Supabase project (before the q8 reindex):

- Database: 13,642,899 → 14,552,211 bytes; image table plus indexes: 1,572,864 → 2,433,024 bytes.
- Storage: 78,612,292 → 99,091,939 bytes, including the three unused staged photos.
- After the deliberate q8 reindex, DB was 15,453,331 bytes and image table/indexes 3,325,952 bytes; Storage remained unchanged. The small DB growth includes update/index overhead, not extra images.
- Repeated RPC HTTP latency including network: 38–54 ms; eight unique places unfiltered/nature, six 제주 places, two 서울 industrial places. These are small samples, not p95 load tests.
- Live SQL `EXPLAIN (ANALYZE, BUFFERS)` for the nature-filtered RPC returned eight rows in 8.657 ms, with planning time 6.527 ms. This includes query-vector lookup, not HTTP/API end-to-end latency.

The [current free plan](https://supabase.com/pricing) includes 500 MB DB / 1 GB Storage; limits must be rechecked before further expansion. Do not fill the limit: use a conservative 250 MB Storage review checkpoint, account for delivery bandwidth and index growth, and remeasure latency. Provider rate limits/review effort dominate current expansion. Collector resume/checksums and byte-identical Storage skip avoid unnecessary downloads/uploads; upload buffering is bounded to four files. Browser model and query size do not grow with the photo catalog.

## User experience

The existing Korean, forest-green, photo-first brand/logo/favicon remain in use rather than being redesigned again. Search now reports the registered count for current conditions and avoids downloading/inferencing the model for known-empty filters. A validated embedding is retained only for the same active File, so changing filters/retrying does not repeat CLIP inference; replacing/removing the photo clears it. Region/category conditions are never silently widened. Existing error/loading, map, date/time, heading, attribution, similar-place, and mock flows remain intact.

Checks passed: lint, typecheck, 45 test files / 213 tests, default Turbopack production build, Docker image build/run/health, and the 30-check SQL audit. Thirty browser-bundle files contained neither configured server secret. Playwright mock home/upload/Top 8 flows passed at 1440/1280/375 px without overflow/page errors; an empty 제주 mock filter preserved the condition and made zero search API calls. Public-domain real image search returned eight unique places with 해운대/선유도공원/문화비축기지 each ranked first for its reference photo. Three 부산+nature searches at desktop/laptop/mobile widths returned all four eligible places without increasing the one-image Worker request count. New three-view gallery credits, real Kakao map, date/time solar output, and eight unique similar places excluding the source were verified. The first rollout's Docker GitHub CI passed; Vercel was Ready in 43 seconds. Runtime Dashboard displayed zero warning/error/fatal clusters during the tested window. Image requests encountered transient `ERR_NETWORK_CHANGED`; recheck image loads after network stabilization rather than call this an application exception.

### Precision parity and network placement follow-up

Transformers.js device defaults previously selected q8 for WASM but fp32 for Node. A two-photo same-Node experiment showed fp32/q8 cosine 0.90269 (해운대) and 0.92869 (선유도), proving materially different projections despite identical model IDs. Explicit q8 avoids enlarging the browser download. Offline extraction uses one image per inference (dynamic quantization ranges can depend on other tensor-batch inputs), while checkpoint batching/resume stays intact. `model.dtype` records precision; old missing-field files are treated as fp32 for inspection and rejected by resume/import until regenerated. Regression tests cover these gates. With the new q8 catalog, the same browser photos ranked first at 0.9013 / 0.9599 / 0.9203; backend/decode differences remain, so do not promise byte-identical vectors or label self-match as 100%. Five Korean prompts still collapsed onto 대한극장/청계산입구역/양재시민의숲역; English factory/alley controls remained plausible. Natural-language release stays rejected.

Before region correction, browser Resource Timing measured API requests at 2,159 / 1,617 / 1,575 ms despite small SQL cost. Dashboard confirmed all functions in IAD1. `vercel.json` now pins one Seoul `icn1` region, permitted on [Hobby](https://vercel.com/docs/project-configuration/vercel-json); it does not enable paid multi-region/failover or move Supabase data. Measure after rollout rather than promise an unmeasured speedup. Model-warm whole-search automation took 3,968 ms for a new Worker and 1,891 / 1,881 ms for subsequent new photos; automation overhead is included. The 14,189 ms pre-change first-model measurement is not comparable to warmed model/filter-only paths. Emulated phone viewports are not physical-device memory tests; low-end phone cold download/heap profiling and cross-runtime pixel/preprocessing parity remain open.
