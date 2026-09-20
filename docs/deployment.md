# Free-tier deployment

1. Create a Supabase Free project.
2. Enable pgvector (the migration also runs `create extension if not exists vector with schema extensions`).
3. Run `supabase/migrations/20260920000000_initial_schema.sql` with Supabase SQL Editor or CLI.
4. Create a public Storage bucket named `location-images`; upload only licensed images. Record rights in `DATA_LICENSES.md`.
5. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Set both mock flags to `false` only after real data, embeddings, and keys are ready. Configure a Kakao JavaScript app key and allowed web domains for the real map.
6. Create a Vercel Hobby project and connect the GitHub repository. The root is the Next.js app; no custom `vercel.json` is needed.
7. Copy the same public environment variables into Vercel project settings and deploy.
8. Verify the home, search, and detail pages plus a real image query. Confirm browser model download size and latency on target devices.

For a demo without external accounts, leave both mock flags true and omit the other variables. Never set a service role key in a `NEXT_PUBLIC_*` variable or the Vercel browser bundle. Vercel/Supabase plan limits and terms may change; check them before a public launch.
