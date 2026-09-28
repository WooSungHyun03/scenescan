-- Backend-owned follow-up: adds exclude_location_id to match_location_images
-- for the new "similar locations" endpoint, replacing the RPC created in
-- 20260928010000_match_location_images_filters.sql (that file is not
-- edited; this migration supersedes its function definition).
--
-- Similar-locations search uses one of a location's own image embeddings as
-- the query vector, so that location's *other* images are near-guaranteed
-- to dominate the raw top-match_count candidates -- the same class of bug
-- filter_region/filter_category fixed for region/category (see
-- 20260928010000_match_location_images_filters.sql): removing the match
-- after the fact in application code can starve the result of everything
-- else if match_count isn't large enough to reach past the excluded
-- location's own images. Filtering it out in SQL means the match_count cap
-- applies after exclusion, not before.
--
-- exclude_location_id is added as the last parameter with a default, so
-- every existing named-parameter caller (src/domains/locations/server/
-- supabase-repository.ts's searchSupabaseLocations, and
-- scripts/embeddings/import.ts's probeRpc) is unaffected: PostgREST/
-- supabase-js call this function with named arguments, so an omitted
-- parameter simply takes its SQL default (null, meaning "exclude nothing").
drop function if exists public.match_location_images(extensions.vector, double precision, integer, text, text, text);

create function public.match_location_images(
  query_embedding extensions.vector(512),
  match_threshold double precision default 0,
  match_count integer default 40,
  filter_region text default null,
  filter_category text default null,
  expected_embedding_model text default null,
  exclude_location_id uuid default null
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
    and li.embedding_model = expected_embedding_model
    and (filter_region is null or l.region = filter_region)
    and (filter_category is null or l.category = filter_category)
    and (exclude_location_id is null or li.location_id <> exclude_location_id)
    and 1 - (li.embedding <=> query_embedding) >= greatest(0, least(match_threshold, 1))
  order by li.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 200);
$$;

comment on function public.match_location_images(
  extensions.vector, double precision, integer, text, text, text, uuid
) is
  'Ranks location_images by cosine similarity (1 - cosine distance, via the <=> operator) to query_embedding, highest first, returning up to match_count rows (capped at 200) at or above match_threshold (compared against similarity, not raw distance). filter_region/filter_category restrict candidates by the joined location''s region/category when non-null; a null filter applies no restriction. expected_embedding_model restricts candidates to rows whose location_images.embedding_model matches exactly; passing null matches zero rows (fail closed) rather than skipping the check, so callers must always supply the model/revision string their query_embedding was produced with. exclude_location_id, when non-null, drops every image belonging to that location from the candidate set before the match_count limit is applied -- used by similar-locations search, whose query_embedding comes from the location being excluded and would otherwise dominate the results with its own other images. Results are image-level and not deduplicated by location -- callers group by location_id (see src/domains/locations/services/group-image-matches.ts) and should request enough rows (via match_count) to fill their location-level result limit after grouping and filtering.';

grant execute on function public.match_location_images(
  extensions.vector, double precision, integer, text, text, text, uuid
) to anon, authenticated;
