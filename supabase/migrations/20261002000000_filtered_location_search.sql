-- Exact max-per-place retrieval for the small free-tier catalog. Filtering and
-- deduplication happen BEFORE the result limit; global image caps lose matches.
-- Additive RPC keeps older deployments and the embedding importer compatible.
create or replace function public.match_location_images_filtered(
  query_embedding extensions.vector(512),
  match_threshold double precision default 0,
  match_count integer default 8,
  filter_region text default null,
  filter_category text default null
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

grant execute on function public.match_location_images_filtered(extensions.vector, double precision, integer, text, text) to anon, authenticated;
