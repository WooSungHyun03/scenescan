# SceneScan agent instructions

Read this file, `docs/architecture.md`, `docs/api-contracts.md`, and `docs/team-ownership.md` before editing.

## Purpose and architecture

SceneScan is a four-student open-source location hunting MVP. One Next.js App Router app serves the UI and API. Browser CLIP embeddings go to `/api/search`; Supabase pgvector ranks location images; application code groups them into locations. Mock mode runs without external keys. There is no separate AI server.

## Ownership

- Member 1, AI / Deployment: `src/lib/ai/**`, `scripts/embeddings/**`, deployment configuration and docs, vector search integration in coordination with Member 3.
- Member 2, Frontend / UX: `src/app/**` except `src/app/api/**`, `src/domains/*/components/**`, `src/shared/ui/**`.
- Member 3, Backend / Application: `src/domains/*/server/**`, `src/app/api/**`, `src/infrastructure/supabase/**`, `supabase/migrations/**` in coordination with Member 1 and 4.
- Member 4, Data / Geo: location-domain services under `src/domains/locations/services/**` for geo, maps, solar, and production metadata, plus `scripts/data/**`.

Shared files (`src/types/**`, `src/shared/**`, domain composition files, `package.json`, root config) require coordination. Keep edits inside your area unless the team agrees on a cross-area change. Do not let Codex rewrite another owner's implementation for convenience.

## Contracts and dependency direction

- Domain types and API request/response types live only in `src/types/**`. `docs/api-contracts.md` is the written contract. Do not define a second `Location`, `GeoPoint`, `SearchResponse`, etc. in a feature folder.
- UI imports types, feature functions, and calls API; it does not query Supabase or implement CLIP directly.
- API uses domain repositories. Repositories may call infrastructure adapters such as Supabase; mock repositories use domain fixtures. AI worker does inference in the browser.
- Before implementing a feature, search the repository for an existing type, utility, service, adapter, or component with the same responsibility. Extend existing code instead of creating duplicate implementations.

## Working rules

1. Read the existing implementation before editing.
2. Add dependencies only for a concrete need; record the reason in the PR. Use pnpm.
3. Never commit keys. `.env.example` documents public variables. Never expose a Supabase service role key to the browser or `NEXT_PUBLIC_*`.
4. Keep `NEXT_PUBLIC_USE_MOCK_DATA=true` and `NEXT_PUBLIC_USE_MOCK_AI=true` working without Supabase, Kakao, or model downloads.
5. Use authorized data and images only. Synthetic fixtures are explicitly marked as such.
6. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before completing a change.
