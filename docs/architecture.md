# Architecture

## Decision

Single Next.js App Router project with strict TypeScript, Tailwind CSS, shadcn/ui-owned components, Zod, Supabase Postgres/pgvector/Storage, Kakao Maps SDK, SunCalc, and Transformers.js. pnpm manages dependencies. Deploy the app on Vercel Hobby and data on Supabase Free. A standalone production image supports portable self-hosting and CI verification; there is no separate AI service, monorepo, paid AI API, or container orchestrator.

`pnpm-workspace.yaml` lists only the root package; it exists solely to allow the native ONNX Runtime install hook used by the offline preprocessing script.

## Flows

```text
Runtime: image → browser ImageEmbeddingService → Web Worker CLIP (or mock)
       → POST /api/search → mock repository or Supabase RPC
       → validated image matches → deterministic max-per-location grouping → Top 8

Offline: licensed location image → scripts/embeddings/prepare.ts
       → validated manifest → batched/resumable 512D CLIP vector JSON
       → reviewed upload to Supabase Storage → import into Supabase location_images

Similar: selected location → mean of its compatible non-null image embeddings
       → cosine search excluding selected/seen locations before LIMIT → deterministic Top 8
```

The runtime worker is loaded only if `NEXT_PUBLIC_USE_MOCK_AI=false`. The UI remains responsive while the model loads. Runtime defaults to the Transformers.js WASM device so browsers without WebGPU remain supported. An experimental build may set `NEXT_PUBLIC_CLIP_DEVICE=webgpu`; a WebGPU initialization failure retries once with WASM and records the actual device in performance diagnostics. Invalid values also resolve to WASM. Offline and runtime embeddings use the same model and preprocessing. The [Transformers.js image-feature-extraction documentation](https://huggingface.co/docs/transformers.js/api/pipelines) shows `Xenova/clip-vit-base-patch32` yielding `[1, 512]`.

Runtime AI accepts JPEG, PNG, and WebP files up to 15 MB, 8192 px on either axis, and 20 megapixels. The main thread validates the file envelope; the worker validates decoded dimensions and rejects malformed or non-finite model output. One service instance owns one worker, and the worker owns one lazily initialized model promise. Requests are correlated by ID, default to a 120-second timeout, may be cancelled with an `AbortSignal`, and are retried once on a worker crash. Model state is observable as `idle`, `loading` (with optional aggregate download percentage), `ready`, or `error`.

Each successful real inference records timing for worker queue wait, decode, model wait, inference, total worker time, and main-thread transfer/queue overhead plus the actual execution device. The worker serializes decode and inference so rapid concurrent requests cannot create multiple decoded-image/model executions at once. A cancelled queued request is dropped before decode; active inference remains non-preemptive and its late reply is ignored. The service retains only the latest 20 small numeric samples so diagnostics cannot grow without bound or retain user image data. See `docs/ai-performance.md`.

The offline pipeline imports the same model ID, revision, dimension, image envelope, and decoded-dimension validators as runtime AI. Its versioned manifest records image/location UUIDs plus source provenance. Output has deterministic manifest order and no timestamps; it records the installed Transformers.js version and writes an atomic checkpoint after each batch. A normal rerun resumes matching completed records and retries failures. See `docs/offline-embeddings.md`.

## Module boundaries

- `src/domains/search/**` owns the search experience; `src/domains/locations/**` owns location display, ranking, geo/map/solar services, fixtures, and repositories.
- `src/lib/ai/**` is the cross-runtime CLIP boundary shared by browser inference and offline tooling.
- `src/infrastructure/**` contains external-system clients. Domain repositories may depend on infrastructure; infrastructure never imports UI.
- `src/shared/**` contains genuinely cross-domain UI primitives, structured application errors, API error mapping, and logging. Feature-specific helpers stay in their domain.
- `src/types/**` is the only home for shared domain and HTTP contracts.

Pages compose domains and call application APIs or repository-backed server components. API routes validate shared contracts before calling domain repositories. The location map service switches between a Kakao adapter and a no-key preview, while solar calculation remains a pure domain service except for SunCalc. Shooting date/time inputs are location wall-clock values: the current Korean catalog resolves them with the explicit `Asia/Seoul` IANA zone before SunCalc receives a UTC instant, so browser/server `TZ` never changes the result. The resolver is dependency-free, validates calendar values, handles DST gaps/overlaps for future non-Korean zones, and exposes a location-time-zone override point. Exceptions cross the API boundary through one structured mapper, and server/client error surfaces use the shared logger.

The shortlist remains a browser-only workflow: it stores only location IDs under a versioned `localStorage` key, synchronizes changes across cards and browser tabs, and resolves those IDs against the existing read-only location repository. It does not add authentication, server writes, or a new database contract.

The browser map adapter loads the official Kakao Maps JavaScript SDK only when `NEXT_PUBLIC_KAKAO_MAP_KEY` is configured. The Kakao Developers application must register every local and production JavaScript SDK domain. Missing keys and SDK load failures preserve the no-key map preview; neither case blocks location detail or search results. The adapter receives WGS84 coordinates and display labels from the location domain and does not geocode inside the UI.

The Docker build uses Next.js standalone output, installs dependencies in a dedicated stage, and runs the final image as an unprivileged user. `/api/health` is the container and deployment liveness endpoint. GitHub Actions runs lint, type checking, tests, the Next.js build, image build, container smoke checks, and key-free browser E2E inside Docker. Real Vercel/Supabase/CLIP/Kakao smoke coverage is isolated in a weekly/manual single-query workflow so PR traffic cannot consume the free production quotas. Vercel's existing Git integration remains the only production deploy trigger, avoiding a duplicate CI deployment.

## Known scaffold limits

- Mock search ranking is synthetic and only proves the end-to-end contract. The percentage badge is not a measured visual match in mock mode.
- Max-per-location is the production aggregation default. A pure top-k mean alternative exists for DAY 7 evaluation but is not enabled without retrieval evidence. See `docs/search-ranking.md`.
- Search applies region/category/model filters and location deduplication in SQL before LIMIT. Read-only browse pagination uses `GET /api/locations`; shortlist resolves saved IDs explicitly instead of assuming the first page is the whole catalog.
- Production image search uses a partial HNSW cosine index. The reviewed catalog contains 200 locations/261 embeddings; actual database/Storage/egress usage must still be monitored rather than inferred from row counts alone.
- Model-safe similar ranking requires `20261004000002_model_safe_similar_search.sql` and compatible embedded rows. The legacy RPC remains only for rolling deployment of the existing single-model catalog; it cannot guarantee model isolation or full candidate coverage. Unknown locations or sources without embeddings intentionally return an empty state.
- The offline preparation script emits deterministic JSON for review. A separate importer defaults to offline validation, performs remote foreign-key/RPC preflight in dry-run mode, and requires an explicit apply mode plus a server-only service role for controlled upsert. No external records or images are bundled.
- This public read-only MVP has no authentication or authoring UI. Production data insertion uses controlled Supabase tooling.
