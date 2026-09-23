# SceneScan

SceneScan is an open-source student project for finding filming locations from a reference image. It is an MVP scaffold: mock mode runs now; real dataset collection and relevance tuning are future work. UI text is Korean.

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

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_USE_MOCK_DATA` | Defaults to true; `false` switches server reads/search to Supabase |
| `NEXT_PUBLIC_USE_MOCK_AI` | Defaults to true; `false` loads browser CLIP worker |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL for real data |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key; RLS restricts writes |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | Kakao JavaScript key and registered domain for real map |
| `SUPABASE_URL` | Server-only project URL used by the local embedding importer |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only service role used only for controlled local imports |

Never commit `.env.local` or a Supabase service role key. Public `NEXT_PUBLIC_*` variables are visible in the browser bundle. The importer rejects a service role placed in `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`.

## Scripts

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm docker:build
pnpm docker:up
pnpm embeddings:prepare scripts/embeddings/manifest.example.json output.json --batch-size 8 --retries 1
pnpm embeddings:import output.json --validate-only
pnpm embeddings:audit-schema
```

The preparation command is for licensed local images after replacing the example manifest paths, UUIDs, and provenance fields. It validates image bytes and metadata, processes configurable batches, writes an atomic resumable JSON checkpoint after every batch, and retries prior failures on the next run. Import defaults to credential-free validation; database dry-run and apply modes are documented in [offline embeddings](docs/offline-embeddings.md).

## Team and deployment

Four path owners are defined in [team ownership](docs/team-ownership.md) and [AGENTS.md](AGENTS.md). Contribution steps are in [CONTRIBUTING.md](CONTRIBUTING.md). Production runs at [beceleb.org](https://beceleb.org) on Vercel Hobby with Cloudflare DNS; Supabase Free backs real data when enabled. The same standalone app can be built and smoke-tested with Docker. See [deployment](docs/deployment.md).

## License

Code is [MIT licensed](LICENSE). Fixture images are project-created synthetic illustrations. Third-party data and image rights are tracked separately in [DATA_LICENSES.md](DATA_LICENSES.md).
