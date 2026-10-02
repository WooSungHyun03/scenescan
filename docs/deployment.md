# Free-tier deployment

The current production topology is Vercel Hobby for the Next.js application, Supabase Free for Postgres/pgvector/Storage, and Cloudflare Free for `beceleb.org` DNS. GitHub `main` is connected directly to Vercel, so GitHub Actions validates the Docker build but does not issue a second deploy.

1. Create a Supabase Free project.
2. Enable pgvector (the migration also runs `create extension if not exists vector with schema extensions`).
3. Apply every file in `supabase/migrations/` in timestamp order with the Supabase SQL Editor or CLI. The initial migration creates the pgvector schema and RPCs; `20260929000000_scale_location_catalog.sql` expands the nationwide region constraint and adds the partial cosine HNSW index.
4. Run `pnpm data:upload-storage ... --dry-run` and then `--apply`. The apply command creates the public `location-images` bucket when absent, enforces a 5 MB JPEG object limit, uploads deterministic object paths, and rewrites runtime URLs. Record rights in `DATA_LICENSES.md`.
5. Run `pnpm embeddings:audit-schema`, then import `data/production/locations.json` with `pnpm data:import-production ... --dry-run` and `--apply`. Validate and import `data/production/embeddings.json` afterward. The exact commands are in `scripts/data/README.md`. `SUPABASE_SECRET_KEY` is needed only in the trusted local import process and must not be added to Vercel; the legacy service-role variable remains accepted during migration.
6. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Set both mock flags to `false` only after real data, embeddings, and keys are ready. Configure a Kakao JavaScript app key and allowed web domains for the real map.
7. Create a Vercel Hobby project and connect the GitHub repository. The root is the Next.js app; no custom `vercel.json` is needed.
8. Copy the same public environment variables into Vercel project settings and deploy.
9. Verify the home, search, and detail pages plus a real image query. Confirm browser model download size and latency on target devices.

For a demo without external accounts, leave both mock flags true and omit the other variables. Never set a service role key in a `NEXT_PUBLIC_*` variable or the Vercel browser bundle. Vercel/Supabase plan limits and terms may change; check them before a public launch.

The 2026-09-29 production catalog contains 159 locations and 209 images. Its 78.6 MB of image objects uses about 7.3% of the current 1 GB Free Storage allowance. Supabase Free currently documents a 500 MB database quota and 10 GB monthly bandwidth split between cached and uncached egress; keep at least 25% storage headroom and monitor egress before raising the discovery cap. Image transforms are not available on Free, so the collector requests 1024 px Commons thumbnails before upload.

## Docker deployment parity

The image embeds only `NEXT_PUBLIC_*` build arguments; do not pass secrets as build arguments. Server-only secrets belong in runtime environment variables. Mock mode is the default.

```bash
docker build -t scenescan:local .
docker run --rm -p 3000:3000 scenescan:local
curl --fail http://127.0.0.1:3000/api/health
```

For a production-like local run, copy `.env.example` to an ignored `.env.local` or export the required public variables, then run `docker compose up --build`. Compose applies a non-root user, drops Linux capabilities, enables `no-new-privileges`, and checks `/api/health`. Public variables used by client code are compiled into the image, so rebuild after changing them.

`NEXT_PUBLIC_*` values are fixed into the bundle during `pnpm build` inside the `builder` stage (passed as `ARG`s); setting them as `docker run -e` environment variables on the already-built image has no effect. To change a `NEXT_PUBLIC_*` value, pass it as a `--build-arg` and rebuild the image.

Resend is intentionally not configured: this read-only MVP has no email flow. Supabase Auth callback URLs are likewise not required until authentication exists. Adding either integration should start with an application feature and contract, not an unused production credential.
