# Architecture

## Decision

Single Next.js App Router project with strict TypeScript, Tailwind CSS, shadcn/ui-owned components, Zod, Supabase Postgres/pgvector/Storage, Kakao Maps SDK, SunCalc, and Transformers.js. pnpm manages dependencies. Deploy the app on Vercel Hobby and data on Supabase Free. No Python service, monorepo, paid AI API, or container orchestration.

`pnpm-workspace.yaml` lists only the root package; it exists solely to allow the native ONNX Runtime install hook used by the offline preprocessing script.

## Flows

```text
Runtime: image → browser ImageEmbeddingService → Web Worker CLIP (or mock)
       → POST /api/search → mock repository or Supabase RPC
       → validated image matches → deterministic max-per-location grouping → Top 8

Offline: licensed location image → scripts/embeddings/prepare.ts
       → validated manifest → batched/resumable 512D CLIP vector JSON
       → reviewed import into Supabase location_images
```

The runtime worker is loaded only if `NEXT_PUBLIC_USE_MOCK_AI=false`. The UI remains responsive while the model loads. Initial model download and browser memory usage need device testing. Offline and runtime embeddings must use the same model and preprocessing. The [Transformers.js image-feature-extraction documentation](https://huggingface.co/docs/transformers.js/api/pipelines) shows `Xenova/clip-vit-base-patch32` yielding `[1, 512]`.

Runtime AI accepts JPEG, PNG, and WebP files up to 15 MB, 8192 px on either axis, and 20 megapixels. The main thread validates the file envelope; the worker validates decoded dimensions and rejects malformed or non-finite model output. One service instance owns one worker, and the worker owns one lazily initialized model promise. Requests are correlated by ID, default to a 120-second timeout, may be cancelled with an `AbortSignal`, and are retried once on a worker crash. Model state is observable as `idle`, `loading` (with optional aggregate download percentage), `ready`, or `error`.

The offline pipeline imports the same model ID, revision, dimension, image envelope, and decoded-dimension validators as runtime AI. Its versioned manifest records image/location UUIDs plus source provenance. Output has deterministic manifest order and no timestamps; it records the installed Transformers.js version and writes an atomic checkpoint after each batch. A normal rerun resumes matching completed records and retries failures. See `docs/offline-embeddings.md`.

`src/types/**` defines shared shapes. Pages and components call application APIs or repository-backed server components; repositories own data access. The `src/lib/maps` boundary switches between a Kakao adapter and a no-key preview. `src/features/solar/solar-position.ts` is pure except for SunCalc.

## Known scaffold limits

- Mock search ranking is synthetic and only proves the end-to-end contract. The percentage badge is not a measured visual match in mock mode.
- Max-per-location is the production aggregation default. A pure top-k mean alternative exists for DAY 7 evaluation but is not enabled without retrieval evidence. See `docs/search-ranking.md`.
- The real RPC retrieves at most 200 top images before app-side region/category filtering. A larger dataset may need SQL-side filters to avoid excluding eligible lower-ranked images.
- Real-mode similar-location ranking is reserved for Member 1 and 3; the UI currently shows an empty state.
- The offline preparation script emits deterministic JSON for review. A separate importer defaults to offline validation, performs remote foreign-key/RPC preflight in dry-run mode, and requires an explicit apply mode plus a server-only service role for controlled upsert. No external records or images are bundled.
- This public read-only MVP has no authentication or authoring UI. Production data insertion uses controlled Supabase tooling.
