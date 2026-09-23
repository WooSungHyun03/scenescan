# Free-tier deployment

The current production topology is Vercel Hobby for the Next.js application, Supabase Free for Postgres/pgvector/Storage, and Cloudflare Free for `beceleb.org` DNS. GitHub `main` is connected directly to Vercel, so GitHub Actions validates the Docker build but does not issue a second deploy.

1. Create a Supabase Free project.
2. Enable pgvector (the migration also runs `create extension if not exists vector with schema extensions`).
3. Run `supabase/migrations/20260920000000_initial_schema.sql` with Supabase SQL Editor or CLI.
4. Create a public Storage bucket named `location-images`; upload only licensed images. Record rights in `DATA_LICENSES.md`.
5. Run `pnpm embeddings:audit-schema`, validate the reviewed embedding output, then use the server-only importer dry-run before applying it. `SUPABASE_SERVICE_ROLE_KEY` is needed only in the trusted local import process and must not be added to Vercel.
6. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Set both mock flags to `false` only after real data, embeddings, and keys are ready. Configure a Kakao JavaScript app key and allowed web domains for the real map.
7. Create a Vercel Hobby project and connect the GitHub repository. The root is the Next.js app; no custom `vercel.json` is needed.
8. Copy the same public environment variables into Vercel project settings and deploy.
9. Verify the home, search, and detail pages plus a real image query. Confirm browser model download size and latency on target devices.

For a demo without external accounts, leave both mock flags true and omit the other variables. Never set a service role key in a `NEXT_PUBLIC_*` variable or the Vercel browser bundle. Vercel/Supabase plan limits and terms may change; check them before a public launch.

## Docker deployment parity

The image embeds only `NEXT_PUBLIC_*` build arguments; do not pass secrets as build arguments. Server-only secrets belong in runtime environment variables. Mock mode is the default.

```bash
docker build -t scenescan:local .
docker run --rm -p 3000:3000 scenescan:local
curl --fail http://127.0.0.1:3000/api/health
```

For a production-like local run, copy `.env.example` to an ignored `.env.local` or export the required public variables, then run `docker compose up --build`. Compose applies a non-root user, drops Linux capabilities, enables `no-new-privileges`, and checks `/api/health`. Public variables used by client code are compiled into the image, so rebuild after changing them.

Resend is intentionally not configured: this read-only MVP has no email flow. Supabase Auth callback URLs are likewise not required until authentication exists. Adding either integration should start with an application feature and contract, not an unused production credential.
