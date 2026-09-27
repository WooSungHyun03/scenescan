# Database

Migration: `supabase/migrations/20260920000000_initial_schema.sql`.

| Table | Purpose |
| --- | --- |
| `locations` | Identity, descriptive data, region/category, coordinates, permit contact, small noise metadata JSONB |
| `location_images` | Multiple images per location; nullable `extensions.vector(512)` for offline backfill |
| `parking` | Nearby parking; optional location link |

The 512 dimensions match the chosen CLIP image feature extractor's documented output. Cosine distance (`<=>`) is used in the RPC, following [Supabase's pgvector guidance](https://supabase.com/docs/guides/ai/semantic-search). The migration enables pgvector, read-only RLS policies for `anon`/`authenticated`, and an invoker-rights RPC. No client write policy is created. Start with sequential vector scans for a small student dataset; add a cosine HNSW index after measuring dataset size and query cost.

`match_location_images` clamps similarity threshold to 0–1 and match count to 1–200. API validation additionally rejects malformed, non-finite, wrong-dimension, and all-zero queries before they reach pgvector. Empty tables return an empty result. Offline import validates every vector, verifies location foreign keys and existing image ownership, probes the RPC, and only then allows controlled service-role upserts. See [offline embeddings](offline-embeddings.md).

`match_similar_location_images` computes a representative vector as the mean of all non-null embeddings belonging to the selected location. It excludes that location inside SQL, uses cosine distance, applies the same threshold/count bounds, and orders equal distances by location and image UUID. The application repeats source exclusion and performs max-per-location grouping before returning Top 8.

Run `pnpm embeddings:audit-schema` after migration edits. It audits all committed SQL files in migration order and catches accidental drift in both image-query and similar-location RPC contracts. Run `pnpm embeddings:import output.json --dry-run` against each target project to verify deployed RPCs and referenced rows without writing.

Mock IDs such as `demo-01` are fixture-only. Real rows use UUID. `location_images.image_url` should point to an image the project has rights to publish, preferably in a public Supabase Storage bucket. Do not import external location datasets until their terms are checked.
