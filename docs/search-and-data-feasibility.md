# Search and data feasibility — 2026-10-02

## Release decision: retain image-only search

The production model is `Xenova/clip-vit-base-patch32`, revision `main`, Transformers.js 4.3.0, finite 512-D projected image output, WASM in a browser Worker. Offline images use the same model/preprocessing and raw projection. Both pgvector and the evaluation cosine utility account for norms; no dimension/model/vector policy changed.

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

All 261 photos have original page/author/license metadata in production, with CC0/Public Domain/CC BY/CC BY-SA reuse gates and the attribution table in `data/production/IMAGE_LICENSES.md`. License assertions come from current Commons metadata, not inferred from filenames. No source/content hash duplicates or cosine-similarity >0.99 image pairs were found. The 209 original vectors retain cosine direction to floating-point precision; 52 new finite 512-D vectors were added. Metadata import used `--insert-only`, preserving existing place operational information. A separate source-field-only update filled previously missing image credits without changing image identity/URL or place permissions/contacts. The missing attribution migration was applied before import.

This is a discovery catalog, not a verified permission directory. Contacts stay null; permits require checking. Wikidata coordinates for large natural features may represent centroids rather than entrances. Four categories do not capture all shooting styles; 44/68 region-category cells remain under the three-place target. Interiors and multiple useful scene views remain the main quality gaps; licensed operational data, not DB space, is the limiting factor. Do not manufacture roofs, abandoned-building access, parking occupancy, noise dB, or phone numbers to fill them.

## Retrieval and capacity

The additive filtered RPC filters before limit, selects one best image per place, and orders deterministically. App-level Top 8 grouping remains unchanged; only matching place IDs are fetched instead of the full catalog. HNSW and legacy/similar RPCs are retained. No RLS/write privileges are widened. Filtered requests cannot silently fall back to the old global-200-image cap.

Post-import measurements from the actual Supabase project:

- Database: 13,642,899 → 14,552,211 bytes; image table plus indexes: 1,572,864 → 2,433,024 bytes.
- Storage: 78,612,292 → 99,091,939 bytes, including the three unused staged photos.
- Repeated RPC HTTP latency including network: 38–54 ms; eight unique places unfiltered/nature, six 제주 places, two 서울 industrial places. These are small samples, not p95 load tests.
- Live SQL `EXPLAIN (ANALYZE, BUFFERS)` for the nature-filtered RPC returned eight rows in 8.657 ms, with planning time 6.527 ms. This includes query-vector lookup, not HTTP/API end-to-end latency.

The [current free plan](https://supabase.com/pricing) includes 500 MB DB / 1 GB Storage; limits must be rechecked before further expansion. Do not fill the limit: use a conservative 250 MB Storage review checkpoint, account for delivery bandwidth and index growth, and remeasure latency. Provider rate limits/review effort dominate current expansion. Collector resume/checksums and byte-identical Storage skip avoid unnecessary downloads/uploads; upload buffering is bounded to four files. Browser model and query size do not grow with the photo catalog.

## User experience

The existing Korean, forest-green, photo-first brand/logo/favicon remain in use rather than being redesigned again. Search now reports the registered count for current conditions and avoids downloading/inferencing the model for known-empty filters. A validated embedding is retained only for the same active File, so changing filters/retrying does not repeat CLIP inference; replacing/removing the photo clears it. Region/category conditions are never silently widened. Existing error/loading, map, date/time, heading, attribution, similar-place, and mock flows remain intact.

Pre-rollout checks passed: lint, typecheck, 45 test files / 209 tests, default Turbopack production build, Docker image build/run/health, and the 30-check SQL audit. Thirty browser-bundle files contained neither configured server secret. Playwright mock home/upload/Top 8 flows passed at 1440/1280/375 px without overflow/page errors; an empty 제주 mock filter preserved the condition and made zero search API calls. Real production baseline before the UI change was 14,189 ms for model initialization plus inference/API/rendering with 선유도공원 first. This single measurement is not comparable to cache-warm filter-only requests. Rollout must additionally verify real inference, filtered reuse, detail attribution, Kakao map, and similar places on the public domain. Emulated phone viewports are not evidence of physical-device memory stability; real low-end phone cold download/heap profiling remains open.
