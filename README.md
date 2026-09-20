# SceneScan

SceneScan is an open-source student project for finding filming locations from a reference image. It is an MVP scaffold: mock mode runs now; real dataset collection and relevance tuning are future work. UI text is Korean.

## Architecture

One Next.js App Router app serves pages and a search API. In real mode, browser Transformers.js produces a 512-dimensional CLIP embedding in a Web Worker; Supabase pgvector ranks location images; server code groups the strongest image per location and returns up to eight locations. Location image embeddings are prepared offline. See [architecture](docs/architecture.md), [contracts](docs/api-contracts.md), and [database](docs/database.md).

## Local development

Use Node.js 22 and pnpm 10. Copy `.env.example` to `.env.local`, or leave it absent to use the default mock mode.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`, choose **이미지 업로드**, select an image, and run a mock search. No account, model download, map key, or Supabase project is needed in mock mode.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_USE_MOCK_DATA` | Defaults to true; `false` switches server reads/search to Supabase |
| `NEXT_PUBLIC_USE_MOCK_AI` | Defaults to true; `false` loads browser CLIP worker |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL for real data |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key; RLS restricts writes |
| `NEXT_PUBLIC_KAKAO_MAP_KEY` | Kakao JavaScript key and registered domain for real map |

Never commit `.env.local` or a Supabase service role key. Public `NEXT_PUBLIC_*` variables are visible in the browser bundle.

## Scripts

```bash
pnpm dev
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm embeddings:prepare scripts/embeddings/manifest.example.json output.json
```

The embedding command is for licensed local images after replacing the example manifest paths and UUIDs. It downloads the CLIP model and writes JSON for a reviewed import; it does not write to Supabase.

## Team and deployment

Four path owners are defined in [team ownership](docs/team-ownership.md) and [AGENTS.md](AGENTS.md). Contribution steps are in [CONTRIBUTING.md](CONTRIBUTING.md). Deploy on Vercel Hobby and Supabase Free following [deployment](docs/deployment.md). Mock mode also deploys without Supabase.

## License

Code is [MIT licensed](LICENSE). Fixture images are project-created synthetic illustrations. Third-party data and image rights are tracked separately in [DATA_LICENSES.md](DATA_LICENSES.md).
