-- Backend-owned follow-up: adds SQL-side region/category filtering and
-- embedding-model gating to match_location_images, replacing the RPC
-- created in 20260920000000_initial_schema.sql (that migration file is not
-- edited; this migration supersedes its function definition).
--
-- Fixes a correctness bug: match_location_images previously returned a
-- fixed top-N of the nearest images across the *entire* table with no
-- region/category awareness. The application then cross-referenced those
-- candidates against a separately region/category-filtered location list
-- and silently dropped anything not in it (see
-- src/domains/locations/server/supabase-repository.ts and
-- src/domains/locations/services/group-image-matches.ts). A location whose
-- images were not among the raw top-N nearest neighbors was invisible to a
-- matching filter even when it was otherwise a good match. Applying the
-- filter inside this query removes that blind spot. See
-- docs/search-ranking.md for the RPC contract and a reproducible regression
-- test.
drop function if exists public.match_location_images(extensions.vector, double precision, integer);

create function public.match_location_images(
  query_embedding extensions.vector(512),
  match_threshold double precision default 0,
  match_count integer default 40,
  filter_region text default null,
  filter_category text default null,
  expected_embedding_model text default null
)
returns table (
  image_id uuid,
  location_id uuid,
  image_url text,
  similarity double precision
)
language sql stable security invoker
set search_path = public, extensions
as $$
  select
    li.id as image_id,
    li.location_id,
    li.image_url,
    (1 - (li.embedding <=> query_embedding))::double precision as similarity
  from public.location_images li
  join public.locations l on l.id = li.location_id
  where li.embedding is not null
    and (expected_embedding_model is null or li.embedding_model = expected_embedding_model)
    and (filter_region is null or l.region = filter_region)
    and (filter_category is null or l.category = filter_category)
    and 1 - (li.embedding <=> query_embedding) >= greatest(0, least(match_threshold, 1))
  order by li.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 200);
$$;

comment on function public.match_location_images(
  extensions.vector, double precision, integer, text, text, text
) is
  'Ranks location_images by cosine similarity (1 - cosine distance, via the <=> operator) to query_embedding, highest first, returning up to match_count rows (capped at 200) at or above match_threshold (compared against similarity, not raw distance). filter_region/filter_category/expected_embedding_model each restrict candidates (by the joined location''s region/category, or by an exact location_images.embedding_model match) only when non-null; a null value applies no restriction for that parameter. Application callers always pass expected_embedding_model (see src/domains/locations/server/supabase-repository.ts); the null-is-unrestricted behavior is a defense-in-depth default, not the primary safety mechanism. Results are image-level and not deduplicated by location -- callers group by location_id (see src/domains/locations/services/group-image-matches.ts) and should request enough rows (via match_count) to fill their location-level result limit after grouping and filtering.';

grant execute on function public.match_location_images(
  extensions.vector, double precision, integer, text, text, text
) to anon, authenticated;
