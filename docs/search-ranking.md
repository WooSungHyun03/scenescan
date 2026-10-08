# Location search ranking

SceneScan retrieves image-level cosine matches from pgvector and converts them into unique location results in application code. The pure implementation lives in `src/domains/locations/services/location-ranking.ts`; the server service only joins ranked IDs to `Location` metadata.

## Production policy

- Candidate threshold: cosine similarity `>= 0`, enforced by the RPC and defensively by the ranker.
- Aggregation: maximum image similarity per location.
- Result limit: eight locations.
- Matched image: the strongest image for that location.
- Location tie-break: ascending `location_id`.
- Image tie-break within a location: ascending `location_image_id`.

Similar-location queries use the mean of every available image embedding for the selected location. Averaging avoids arbitrarily choosing one source image, while cosine distance makes the magnitude of the mean irrelevant. The selected location is excluded in both SQL and application ranking. Reference + selected-location blending is not enabled because no authorized evaluation set currently demonstrates that it improves retrieval.

Before aggregation, the ranker discards blank IDs, non-finite scores, scores outside cosine range `[-1, 1]`, and locations absent from the filtered metadata set. Repeated hits for the same image are collapsed to their strongest score. Locations are therefore unique even if pgvector returns several matching images for one location. Empty candidates or filters that remove every candidate return an empty list.

Max aggregation remains the default because a reference frame may strongly correspond to one defining view, while locations can have unequal image counts. It also preserves the existing API behavior. DAY 7 synthetic policy evaluation showed the expected tradeoff—top-2 mean won some consistent-view cases and lost some defining-view cases—but its small curated scenarios are not evidence that a production change improves photographic retrieval. See `docs/ai-retrieval-evaluation.md`.

## Top-k mean alternative

The pure ranker also supports `top-k-mean`. It sorts and deduplicates a location's image hits, averages up to its strongest `k`, and keeps the strongest image ID for display. For example, synthetic scores `A=[1.0, 0.1]` and `B=[0.8, 0.7]` rank A first with max, but B first with top-2 mean (`0.75` versus `0.55`). This demonstrates the strategies' behavior; it is not evidence that either strategy retrieves real filming locations better.

Top-k mean remains evaluation-only. On 12 balanced synthetic policy scenarios, top-2 mean at threshold 0 reached 50.0% Top-1 versus max at 41.7%, while both reached 100% Top-3/5 and Recall@3/5. The set was deliberately authored to exercise tradeoffs and did not come from production CLIP/photo pairs, so the eight-point difference cannot justify changing production. Changing the default requires an authorized photographic dataset plus updates to this document, the API contract, and regression expectations together.

## Candidate cap

`SEARCH_MATCH_COUNT_DEFAULT` (200, `src/types/contracts.ts`) remains `match_location_images`'s and `match_similar_location_images`'s ceiling -- both are still image-level RPCs that need a large-enough raw candidate window for `groupImageMatches`/`rankSimilarLocations` to dedupe down to 8 locations afterward. `searchSupabaseLocations`'s primary path no longer needs that margin: `match_location_images_filtered` (`supabase/migrations/20261002000000_filtered_location_search.sql`, `origin/main`) deduplicates to one image per location *inside SQL* (`distinct on (location_id)`), so its `match_count` directly caps the number of places returned and is passed as a fixed `8`, not `SEARCH_MATCH_COUNT_DEFAULT`. `searchSupabaseLocations` only passes `SEARCH_MATCH_COUNT_DEFAULT` to `match_location_images` on its legacy fallback path (filtered RPC's migration not yet applied, unfiltered query only), where the old image-level-then-group behavior still applies.

`match_count` is **not** client-configurable via `POST /api/search` (an earlier revision of this endpoint exposed a `count` field; it was removed from the public request schema because there was no product need for a client to widen/narrow the server's own candidate-retrieval window, only to narrow via `threshold`). `POST /api/search` still lets a caller pass `threshold` (validated `[0,1]`) to narrow the candidate window on either RPC path; it does not change the fixed 8-location result limit above.

## `match_location_images` RPC contract

Defined in `supabase/migrations/20260920000000_initial_schema.sql` and replaced in place (same function name, extended signature) by `supabase/migrations/20261001000003_match_location_images_filters.sql`. No longer this project's primary search path as of the `main` merge that added `match_location_images_filtered` (below) -- kept as `searchSupabaseLocations`'s legacy fallback for an unfiltered query while that RPC's migration is rolling out, and still used directly by `supabase/tests/match-location-images.integration.test.ts`'s region-filter regression test.

```sql
match_location_images(
  query_embedding extensions.vector(512),
  match_threshold double precision default 0,
  match_count integer default 40,
  filter_region text default null,
  filter_category text default null,
  expected_embedding_model text default null
) returns table (
  image_id uuid,
  location_id uuid,
  image_url text,
  similarity double precision
)
```

- **similarity** is defined as `1 - (embedding <=> query_embedding)`, i.e. cosine similarity derived from pgvector's cosine distance operator. `match_threshold` is compared against this same similarity value (clamped to `[0, 1]` via `greatest(0, least(match_threshold, 1))`), never against the raw distance.
- **Ordering**: ascending `embedding <=> query_embedding`, i.e. descending similarity, highest match first.
- **`match_count`**: clamped inside the function to `[1, 200]` via `limit least(greatest(match_count, 1), 200)`. Results are image-level, not deduplicated by location, so callers must request enough rows for a full 8-location result after grouping (see "Aggregation" above).
- **`filter_region` / `filter_category`**: applied in the query via a join to `locations` (`(filter_region is null or l.region = filter_region)`, and likewise for category). A `null` filter applies no restriction. This is SQL-side filtering, not a post-hoc application-side check.
- **`expected_embedding_model`**: an *optional* filter with the same null-means-unrestricted convention as `filter_region`/`filter_category` -- a non-null value must equal `location_images.embedding_model` exactly for a row to be a candidate; `null` applies no restriction (see "Why `expected_embedding_model` exists" below for why application code never actually passes `null`).
- **RLS/grants**: `security invoker` (the caller's own row-level security and table grants apply; there is no elevated access inside the function), `set search_path = public, extensions`, `execute` granted to `anon` and `authenticated`.

### Why `expected_embedding_model` exists

`location_images.embedding_model` (added in `20261001000001_location_import_metadata.sql`) records the exact model/revision that produced each stored vector. Comparing a query embedding against a vector from a different model (or a different quantization of the same model) produces a numerically valid but meaningless cosine similarity -- it degrades ranking quality without raising any error. `src/domains/locations/server/supabase-repository.ts` always passes `` `${CLIP_MODEL_ID}@${CLIP_MODEL_REVISION}` `` (from `src/lib/ai/embedding-service.ts`, reused as-is) as this value on every call to either RPC -- the parameter being nullable at the SQL level is a defense-in-depth default (consistent with `filter_region`/`filter_category`'s own semantics), not the primary safety mechanism; application code is what actually prevents a cross-model comparison. **Follow-up, not done here**: this key does not include `CLIP_MODEL_DTYPE` (`src/lib/ai/embedding-service.ts`, currently `"q8"`) -- if a future dtype change needs to be distinguished from the existing `'...@main'`-tagged rows, switching the key format must ship together with a backfill migration for existing rows, not as a standalone key-format change (which would otherwise silently stop matching every already-imported embedding).

### SQL-side region/category filtering: the bug this fixes

Before this migration, `match_location_images` had no `filter_region`/`filter_category` parameters. `src/domains/locations/server/supabase-repository.ts` ran an unfiltered top-200 nearest-neighbor search, then called `getSupabaseLocations(filters)` to get the region/category-filtered location list, and used that list purely as an *eligibility set* inside `groupImageMatches`/`rankLocationImageHits`. Any image hit whose location wasn't in that filtered list was silently discarded. If every image in the raw top-200 belonged to locations outside the requested region/category, the API returned zero results even when matching locations existed further down the similarity ranking. Moving the filter into the RPC means the 200-row cap applies *after* filtering, not before.

`searchSupabaseLocations` now passes `filter_region`/`filter_category` (alongside `expected_embedding_model`) on every call, and loads `Location` metadata for search results by the exact IDs the RPC returned (`getSupabaseLocationsByIds`) rather than by re-running a region/category filter query. There is no separate app-side eligibility computation left for region/category -- `groupImageMatches`'s `eligibleLocationIds` set is now always exactly "the locations the RPC already told us match," not an independently-derived filter result that could disagree with it.

### Regression test: a filtered-out region must not be dropped

Verified directly against a disposable `pgvector/pgvector:pg16` Postgres container (no Supabase project needed) with all four migrations applied in order. Seed data: one 서울 location with 5 images essentially identical to the query vector, and one 부산 location with 1 image that is a weaker but legitimate match (cosine similarity `0.6`).

```sql
-- Unfiltered top-3: 서울's cluster wins every slot; 부산 never appears.
select image_id, location_id, similarity
from match_location_images(query_embedding, 0, 3, null, null, expected_embedding_model);
-- => 3 rows, all location_id = 서울 location

-- With filter_region = '부산': the 부산 image is returned even though it
-- ranks well outside the unfiltered top-3.
select image_id, location_id, similarity
from match_location_images(query_embedding, 0, 3, '부산', null, expected_embedding_model);
-- => 1 row, location_id = 부산 location, similarity = 0.6
```

Actual output from the verification run:

```
--- unfiltered top-3: A dominates, B is not in it ---
 (3 rows, all location_id = A / 서울, similarity ≈ 1.0000)

--- filter_region = 부산 (B): must still return B image despite ranking below A cluster ---
               image_id               |             location_id              | similarity
--------------------------------------+--------------------------------------+------------
 f2eb78e3-4fbf-42f2-b6c6-0ab5de71e715 | 37b15242-84de-40cb-9af2-ab0cef878ea0 |     0.6000
(1 row)
```

Also verified in the same run: a `location_images` row with a different `embedding_model` value is excluded when the correct `expected_embedding_model` is passed (0 rows). As of the optional-filter change (see above), omitting `expected_embedding_model` now matches across every model instead of matching nothing -- re-verified directly in this project's `supabase/tests/match-location-images.integration.test.ts` ("optional filter" test), not re-run against the disposable container this section's other examples used.

## `match_location_images_filtered` RPC contract

Added by `origin/main` (`supabase/migrations/20261002000000_filtered_location_search.sql`) as `searchSupabaseLocations`'s primary RPC; `expected_embedding_model` added by the backend-owned follow-up `20261002000001_match_location_images_filtered_model.sql`.

```sql
match_location_images_filtered(
  query_embedding extensions.vector(512),
  match_threshold double precision default 0,
  match_count integer default 8,
  filter_region text default null,
  filter_category text default null,
  expected_embedding_model text default null,
  filter_district text default null
) returns table (
  location_image_id uuid,
  location_id uuid,
  similarity double precision
)
```

- Picks the single highest-similarity image per location *inside SQL* (`distinct on (location_id)`, ties broken by `location_id` then `location_image_id`), so `match_count` caps the number of **places** returned, not a raw image pool -- unlike `match_location_images`, there is no separate app-level grouping step needed to reach a per-location result (`searchSupabaseLocations` still runs the result through `groupImageMatches` for consistency with the legacy-fallback path, but it is a no-op on an already-deduplicated list).
- `filter_region`/`filter_category`/`expected_embedding_model`/`filter_district` all follow the same null-means-unrestricted convention as `match_location_images` (see above) -- application code always passes `expected_embedding_model` explicitly, and always passes `filter_region` as the fixed `'부산'` (never a client-supplied region) for the length of the Busan-district contract transition -- see `docs/api-contracts.md`'s "Busan district contract" section and `docs/database.md`.
- No `image_url` column (unlike `match_location_images`) -- the row shape is the same `{location_image_id, location_id, similarity}` triple `match_similar_location_images` returns.
- **Rolling-deploy fallback**: if this RPC is missing (PostgREST `PGRST202`, meaning its migration hasn't reached this project yet) and the request has no `filter_category`/`filter_district`, `searchSupabaseLocations` falls back to `match_location_images` instead (still passing `filter_region = '부산'`, which that RPC also supports). A category- or district-filtered request during that same window fails explicitly (`DATA_UNAVAILABLE`) rather than silently returning unfiltered results, since the legacy RPC cannot honor either filter. A narrower rolling-deploy case -- `filter_district` itself not yet in the deployed signature while the rest of the 6-arg RPC already is -- retries without it only when no district filter was requested; a requested district filter fails explicitly the same way.
- `filter_district` (added 2026-10-08): one of the 16 Busan 구/군 keys in `DISTRICT_VALUES` (`src/types/location-options.ts`) or `null`. A location row whose own `district` is `null` ("구/군 unconfirmed", never guessed -- see `docs/database.md`) never matches a non-null `filter_district`, so it only ever surfaces in an unfiltered-by-district search, the same SQL consequence `filter_region`/`filter_category` already produce for their own null case -- no separate code path needed.

## Similar locations (`GET /api/locations/[id]/similar`)

**Superseded by the `feat/backend-supabase`/`main` merge**: this section (and `match_location_images`'s `exclude_location_id` parameter below) described this branch's own pre-merge implementation. Similar-locations search now uses `origin/main`'s `match_similar_location_images` RPC and `rankSimilarLocations` instead -- see `docs/api-contracts.md` and `docs/database.md` for the current contract. `exclude_location_id` was removed (not kept as a second, unused path). Left as historical context below rather than rewritten; **제거됨, 필요 시 `match_similar_location_images`에 제외 목록 파라미터로 추가** (e.g. a future "비슷한 장소 더 보기" page that must exclude already-shown locations).

Uses `match_location_images` with `query_embedding` set to one of the target location's own stored image embeddings and `exclude_location_id` set to the target location's own ID. No client-supplied vector is involved -- see `docs/api-contracts.md` for the endpoint contract.

### Which embedding represents a location

No existing utility (Member 1's or otherwise) defines how to pick or combine a location's embedding(s) for this purpose -- `src/domains/locations/services/location-ranking.ts` and `group-image-matches.ts` both operate on an already-produced list of image hits; neither has an opinion on selecting a location's own representative embedding. Implemented with the simplest reasonable rule pending Member 1 input: the target location's oldest `location_images` row (`order by created_at, id limit 1`) whose `embedding_model` matches the server's expected model/revision and whose `embedding` is not null. `TODO(similar-locations-embedding)` in `src/domains/locations/server/supabase-repository.ts` marks this; an averaged/pooled embedding across a location's images is a plausible alternative Member 1 may prefer, which would require a small additional SQL aggregate (not a ranking-utility change, so still backend-owned, but the *choice* of pooling strategy is a Member 1 call).

If the location has no `location_images` row at all, or none with a non-null embedding matching the expected model, the endpoint returns an empty result (`{ results: [] }`), not an error -- indistinguishable at the response level from "found candidates but none passed threshold." Same rule as plain search.

### Regression test: excluding a location's own images must not starve the result

Verified against the same disposable Postgres container, migration `20260928030000` applied. Seed: location A with 5 images essentially identical to A's own query vector (i.e. what happens when A's own embedding is used to search), location B with 1 image, a weaker but legitimate match (similarity `0.6`).

```sql
-- Without exclude_location_id: A's own other images dominate every slot.
select image_id, location_id, similarity
from match_location_images(a_query_embedding, 0, 3, null, null, expected_embedding_model, null);
-- => 3 rows, all location_id = A

-- With exclude_location_id = A: B is returned even though, unfiltered, it
-- never appears in the top 3.
select image_id, location_id, similarity
from match_location_images(a_query_embedding, 0, 3, null, null, expected_embedding_model, a_id);
-- => 1 row, location_id = B, similarity = 0.6
```

Both outcomes were confirmed exactly as shown. Also verified: a pre-existing named-parameter call omitting `exclude_location_id` entirely (`match_threshold => 0, match_count => 10, expected_embedding_model => ...`) still returns all matching rows (6, both locations) -- unaffected by the new parameter, and `anon` can execute the new 7-parameter signature.

The equivalent mock-mode regression (self exclusion holding even when same-category "candidates" would otherwise crowd it out) is covered by a Vitest test in `src/domains/locations/server/mock-repository.test.ts`.
