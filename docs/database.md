# Database

Migration: `supabase/migrations/20260920000000_initial_schema.sql`.

| Table | Purpose |
| --- | --- |
| `locations` | Identity, descriptive data, region/category, coordinates, permit contact, small noise metadata JSONB |
| `location_images` | Multiple images per location; nullable `extensions.vector(512)` for offline backfill |
| `parking` | Nearby parking; optional location link |

The 512 dimensions match the chosen CLIP image feature extractor's documented output. Cosine distance (`<=>`) is used in the RPC, following [Supabase's pgvector guidance](https://supabase.com/docs/guides/ai/semantic-search). The migration enables pgvector, read-only RLS policies for `anon`/`authenticated`, and an invoker-rights RPC. No client write policy is created. Start with sequential vector scans for a small student dataset; add a cosine HNSW index after measuring dataset size and query cost.

`match_location_images` clamps similarity threshold to 0–1 and match count to 1–200. API validation additionally rejects malformed, non-finite, wrong-dimension, and all-zero queries before they reach pgvector. Empty tables return an empty result. Offline import validates every vector, verifies location foreign keys and existing image ownership, probes the RPC, and only then allows controlled service-role upserts. See [offline embeddings](offline-embeddings.md).

Run `pnpm embeddings:audit-schema` after migration edits. This static audit catches accidental contract drift in source SQL; run `pnpm embeddings:import output.json --dry-run` against each target project to verify the deployed RPC and referenced rows without writing.

Mock IDs such as `demo-01` are fixture-only. Real rows use UUID. `location_images.image_url` should point to an image the project has rights to publish, preferably in a public Supabase Storage bucket. Do not import external location datasets until their terms are checked.
