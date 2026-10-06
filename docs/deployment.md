# Free-tier deployment

Production 적용 전에는 [release checklist](release-checklist.md)를 위에서 아래 순서대로 사용한다. 저장소 CI 성공과 실제 Vercel/Supabase/SMTP 배포 성공은 별도 판정이다.

The current production topology is Vercel Hobby for the Next.js application, Supabase Free for Postgres/pgvector/Storage, and Cloudflare Free for `beceleb.org` DNS. GitHub `main` is connected directly to Vercel, so GitHub Actions validates the Docker build but does not issue a second deploy.

1. Create a Supabase Free project.
2. Enable pgvector (the migration also runs `create extension if not exists vector with schema extensions`).
3. Apply every file in `supabase/migrations/` in timestamp order with the Supabase SQL Editor or CLI. The initial migration creates the pgvector schema and RPCs; `20260929000000_scale_location_catalog.sql` expands the nationwide region constraint and adds the partial cosine HNSW index. Account-backed shortlist writes must not be enabled until `20261006000000_user_shortlist.sql` has been applied and its owner-only RLS policies verified. Applying Production migrations remains the deployment owner's action.
4. Run `pnpm data:upload-storage ... --dry-run` and then `--apply`. The apply command creates the public `location-images` bucket when absent, enforces a 5 MB JPEG object limit, uploads deterministic object paths, and rewrites runtime URLs. Record rights in `DATA_LICENSES.md`.
5. Run `pnpm embeddings:audit-schema` and `pnpm data:check-attribution-links ...`, then import `data/production/locations.json` with `pnpm data:import-production ... --dry-run` and `--apply`. Use `--attribution-only` when backfilling existing rows so permit/contact and other operational columns are not replaced. Validate and import `data/production/embeddings.json` afterward. The exact commands are in `scripts/data/README.md`. Local import tools use `SUPABASE_SECRET_KEY`; production uses it only at server runtime when self-service deletion is enabled. The legacy service-role variable remains accepted during migration.
6. Set `NEXT_PUBLIC_SUPABASE_URL` and the preferred `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`NEXT_PUBLIC_SUPABASE_ANON_KEY` remains a temporary legacy fallback). Set both mock flags to `false` only after real data, embeddings, and keys are ready. Configure a Kakao JavaScript app key and allowed web domains for the real map.
7. Create a Vercel Hobby project and connect the GitHub repository. The root is the Next.js app. Committed `vercel.json` selects a single Seoul (`icn1`) function region for Korean users instead of default IAD1. Hobby permits one region; no paid multi-region/failover is enabled. Recheck placement and actual API latency after deployment, especially if the DB region changes.
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

Email/password Auth and recovery are implemented, but production delivery is deliberately not configured in source. In Supabase Auth settings, enable email signup and confirmation, set the production Site URL, allow exactly `https://<production-domain>/auth/callback` and `https://<production-domain>/auth/recovery` (plus only intentional preview URLs), configure production SMTP/templates, and keep the resend interval at least 60 seconds. Use the committed Korean templates with `{{ .ConfirmationURL }}` intact. For browser Auth, provide `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or the legacy public anon key), redeploy, then manually verify signup, recovery, password-change notification, and new-password login on the production domain. Never add `SUPABASE_SECRET_KEY` to Vercel's browser/public variables; it may only exist as the separate server runtime variable described below. Search and location detail remain public when Auth is absent; protected account/recovery pages redirect safely. The exact callback, SMTP, DNS, session, and local Mailpit checklist is in [Auth email setup](auth-email-setup.md).

Self-service account deletion additionally requires server-only `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (or legacy `SUPABASE_SERVICE_ROLE_KEY`) in the Production environment. These values enable only the protected server endpoint and must never be prefixed `NEXT_PUBLIC_`. After registration and redeployment, perform the production smoke sequence in [Account deletion](account-deletion.md); the repository does not modify Vercel or Supabase Dashboard settings automatically.
