# SceneScan

SceneScan is an open-source student project for finding filming locations from a reference image. Production uses a licensed, provenance-tracked Korean location catalog while mock mode remains available for key-free development. UI text is Korean.

## Architecture

One Next.js App Router app serves pages and a search API. In real mode, browser Transformers.js produces a 512-dimensional CLIP embedding in a Web Worker; Supabase pgvector ranks location images; server code groups the strongest image per location and returns up to eight locations. Location image embeddings are prepared offline. See [architecture](docs/architecture.md), [contracts](docs/api-contracts.md), [search ranking](docs/search-ranking.md), and [database](docs/database.md).

Business code is grouped into the `search` and `locations` domains. External clients live in `src/infrastructure`, cross-domain errors/logging/UI primitives in `src/shared`, and shared contracts in `src/types`.

## Local development

Use Node.js 22 and pnpm 10. Copy `.env.example` to `.env.local`, or leave it absent to use the default mock mode.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`, choose **이미지 업로드**, select an image, and run a mock search. No account, model download, map key, or Supabase project is needed in mock mode.

Real browser AI mode accepts JPEG, PNG, and WebP images up to 15 MB, 8192 px per axis, and 20 megapixels. Its first search downloads the public CLIP model; later requests reuse the same worker and model instance.
Production uses the WASM backend for broad browser compatibility and keeps only 20 image-free timing samples for diagnostics. Current browser results and the remaining cold-load/WebGPU matrix are in [AI performance](docs/ai-performance.md).

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_USE_MOCK_DATA` | Defaults to true; `false` switches server reads/search to Supabase |
| `NEXT_PUBLIC_USE_MOCK_AI` | Defaults to true; `false` loads browser CLIP worker |
| `NEXT_PUBLIC_CLIP_DEVICE` | Optional `wasm` (default) or experimental `webgpu`; failed WebGPU initialization falls back to WASM |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL for real data |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key; RLS restricts writes |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | Kakao JavaScript key and registered domain for real map |
| `SUPABASE_URL` | Server-only project URL used by the local embedding and locations/parking importers |
| `SUPABASE_SECRET_KEY` | Server-only secret key used only for controlled local imports |

Never commit `.env.local` or a Supabase secret/service-role key. Public `NEXT_PUBLIC_*` variables are visible in the browser bundle. Both importers reject either privileged key placed in a `NEXT_PUBLIC_*` variable. The legacy `SUPABASE_SERVICE_ROLE_KEY` name remains accepted for existing local setups.

## Scripts

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm test:e2e:production
pnpm test:integration
pnpm build
pnpm docker:build
pnpm docker:up
pnpm data:normalize data-work/raw/provider.json data-work/mappings/provider.json data-work/normalized/provider.json
pnpm data:import data-work/normalized/provider.json data-work/reports/import.json --validate-only
pnpm data:discover-wikidata data-work/wikidata/commons-manifest.json --base data/production/commons-manifest.json --max 400
pnpm data:collect-commons data/production/commons-manifest.json
pnpm data:upload-storage data/production/locations.json data/production/embeddings-manifest.json data/production --dry-run
pnpm embeddings:prepare scripts/embeddings/manifest.example.json output.json --batch-size 8 --retries 1
pnpm embeddings:import output.json --validate-only
pnpm embeddings:audit-schema
pnpm embeddings:evaluate
pnpm embeddings:evaluate-clip
```

`pnpm test` needs no Supabase project or environment variables and is what CI runs on every PR. `pnpm test:e2e` starts a key-free mock app and exercises the browser flow with the committed project-owned evaluation image; run `pnpm exec playwright install chromium` once on a new machine. CI runs the same E2E suite against the standalone production image on an isolated Docker network. `pnpm test:e2e:production` is intentionally excluded from PR CI: the separate weekly/manual workflow makes one real CLIP query against `PRODUCTION_BASE_URL` (default `https://beceleb.org`) and checks API health plus Kakao markers. `pnpm test:integration` needs a live Supabase instance (`pnpm supabase:start` runs one locally via the Supabase CLI) and skips cleanly without one; see [testing](docs/testing.md) for what each suite covers and [integration testing](docs/integration-testing.md) for setup.

`data:import` upserts the `locations` and `parking` rows described by a normalized file (no public write API exists for this -- it is the only way real location data enters the database); it does not touch `location_images` or embeddings. Run it before the embeddings importer, since `location_images.location_id` is a foreign key to `locations.id`. See [data pipeline](docs/data-pipeline.md) for upsert keys, dry-run/apply modes, and the image storage strategy.

The preparation command is for licensed local images after replacing the example manifest paths, UUIDs, and provenance fields. It validates image bytes and metadata, processes configurable batches, writes an atomic resumable JSON checkpoint after every batch, and retries prior failures on the next run. Import defaults to credential-free validation; database dry-run and apply modes are documented in [offline embeddings](docs/offline-embeddings.md).

The committed production catalog contains 200 locations and 261 licensed images across all 17 Korean first-level regions. Runtime image URLs point to the public Supabase Storage bucket; the `wikidata-*.jpg` working files are intentionally regenerated by the Commons collector instead of committed to Git. The latest expansion prioritizes beaches, parks, forests, lakes, waterfalls, and harbors over more stations/schools. See [search and data feasibility](docs/search-and-data-feasibility.md) for measured capacity, language-search experiments, and remaining coverage gaps.

The evaluation command compares max and top-k mean ranking at several thresholds on the committed synthetic policy scenarios. `embeddings:evaluate-clip` regenerates measured cosine scores from the MIT-licensed synthetic image regression set with the production CLIP model; see [retrieval evaluation](docs/ai-retrieval-evaluation.md).

## Team and deployment

Four path owners are defined in [team ownership](docs/team-ownership.md) and [AGENTS.md](AGENTS.md). Contribution steps are in [CONTRIBUTING.md](CONTRIBUTING.md). Production runs at [beceleb.org](https://beceleb.org) on Vercel Hobby with Cloudflare DNS; Supabase Free backs real data when enabled. The same standalone app can be built and smoke-tested with Docker. See [deployment](docs/deployment.md).

## License

Code is [MIT licensed](LICENSE). Fixture images are project-created synthetic illustrations. Third-party data and image rights are tracked separately in [DATA_LICENSES.md](DATA_LICENSES.md).
