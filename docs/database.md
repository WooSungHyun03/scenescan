# Database

Migration: `supabase/migrations/20260920000000_initial_schema.sql`.

| Table | Purpose |
| --- | --- |
| `locations` | Identity, descriptive data, region/category, coordinates, permit contact, source metadata, small noise metadata JSONB |
| `location_images` | Multiple images per location; per-image source/author/license metadata and nullable `extensions.vector(512)` for offline backfill |
| `parking` | Nearby parking; optional location link |

The 512 dimensions match the chosen CLIP image feature extractor's documented output. Cosine distance (`<=>`) is used in the RPC, following [Supabase's pgvector guidance](https://supabase.com/docs/guides/ai/semantic-search). The migration enables pgvector, read-only RLS policies for `anon`/`authenticated`, and an invoker-rights RPC. No client write policy is created. Migration `20260929000000_scale_location_catalog.sql` already adds a cosine HNSW index; the original and similar-image RPCs remain available.

`match_location_images` clamps similarity threshold to 0–1 and match count to 1–200. API validation additionally rejects malformed, non-finite, wrong-dimension, and all-zero queries before they reach pgvector. Empty tables return an empty result. Offline import validates every vector, verifies location foreign keys and existing image ownership, probes the RPC, and only then allows controlled service-role upserts. See [offline embeddings](offline-embeddings.md).

`match_similar_location_images` computes a representative vector as the mean of all non-null embeddings belonging to the selected location. It excludes that location inside SQL, uses cosine distance, applies the same threshold/count bounds, and orders equal distances by location and image UUID. The application repeats source exclusion and performs max-per-location grouping before returning Top 8.

Run `pnpm embeddings:audit-schema` after migration edits. It audits all committed SQL files in migration order and catches accidental drift in both image-query and similar-location RPC contracts. Run `pnpm embeddings:import output.json --dry-run` against each target project to verify deployed RPCs and referenced rows without writing.

Migration `20261001000000_location_attribution.sql` adds nullable source, author, license, license URL, and verification timestamp columns. HTTP(S) checks protect stored source and license links. The production importer fills location fields from canonical provenance and image fields from the reviewed image-license catalog; public reads remain covered by the existing read-only RLS policies.

Migration `20261002000000_filtered_location_search.sql` adds `match_location_images_filtered`: optional region/category filters are applied before ranking/limit; `DISTINCT ON (location_id)` chooses the highest-similarity image per place with deterministic UUID ties. The application fetches only those place IDs and retains its existing max-per-place Top 8 utility/response contract. The former global-200-image cutoff could starve filters once the catalog exceeded 200 images. This additive RPC avoids that bug without changing stored vectors, existing RPCs, or RLS. At the current 261-image scale an exact filtered scan/group is inexpensive and avoids approximate-index recall issues; measure again before growing by orders of magnitude. If migration is missing, only unfiltered search may use the legacy RPC during rollout; filtered search fails explicitly rather than silently returning incomplete results.

Mock IDs such as `demo-01` are fixture-only. Real rows use UUID. `location_images.image_url` should point to an image the project has rights to publish, preferably in a public Supabase Storage bucket. Do not import external location datasets until their terms are checked.
