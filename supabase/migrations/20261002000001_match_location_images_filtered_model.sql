-- Backend-owned follow-up to 20261002000000_filtered_location_search.sql
-- (origin/main). Adds expected_embedding_model as an optional filter,
-- matching match_location_images's own parameter of the same name and
-- semantics (20261001000003_match_location_images_filters.sql): null means
-- no restriction, a non-null value restricts candidates to rows whose
-- location_images.embedding_model matches exactly. Application callers
-- always pass it explicitly (src/domains/locations/server/
-- supabase-repository.ts); the null-is-unrestricted default is
-- defense-in-depth, not the primary safety mechanism -- same rationale as
-- match_location_images, not a fail-closed design here.
--
-- grant/search_path and the DISTINCT ON per-location dedup logic are
-- origin/main's (Member 1/3) and are not changed here -- only the
-- parameter list and WHERE clause grow by one.
drop function if exists public.match_location_images_filtered(extensions.vector, double precision, integer, text, text);

create or replace function public.match_location_images_filtered(
  query_embedding extensions.vector(512),
  match_threshold double precision default 0,
  match_count integer default 8,
  filter_region text default null,
  filter_category text default null,
  expected_embedding_model text default null
)
returns table (location_image_id uuid, location_id uuid, similarity double precision)
language sql stable security invoker
set search_path = public, extensions
as $$
  with best_images as (
    select distinct on (li.location_id)
      li.id, li.location_id, li.embedding <=> query_embedding as distance
    from public.location_images li
    join public.locations l on l.id = li.location_id
    where li.embedding is not null
      and (expected_embedding_model is null or li.embedding_model = expected_embedding_model)
      and (filter_region is null or l.region = filter_region)
      and (filter_category is null or l.category = filter_category)
      and 1 - (li.embedding <=> query_embedding) >= greatest(0, least(match_threshold, 1))
    order by li.location_id, li.embedding <=> query_embedding, li.id
  )
  select id, best_images.location_id, (1 - distance)::double precision
  from best_images
  order by distance, best_images.location_id, id
  limit least(greatest(match_count, 1), 200);
$$;

grant execute on function public.match_location_images_filtered(extensions.vector, double precision, integer, text, text, text) to anon, authenticated;
