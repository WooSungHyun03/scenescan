-- Keep the old RPC for rolling deployments. New callers validate the model
-- before averaging and deduplicate before LIMIT, just like image search.
create or replace function public.match_similar_locations_filtered(
  source_location_id uuid,
  match_threshold double precision default 0,
  match_count integer default 8,
  expected_embedding_model text default null,
  excluded_location_ids uuid[] default '{}'::uuid[]
)
returns table (location_image_id uuid, location_id uuid, similarity double precision)
language sql stable security invoker
set search_path = public, extensions
as $$
  with source as (
    select avg(li.embedding)::extensions.vector(512) as embedding
    from public.location_images li
    where li.location_id = source_location_id
      and li.embedding is not null
      and li.embedding_model = expected_embedding_model
  ), best_images as (
    select distinct on (li.location_id)
      li.id, li.location_id, li.embedding <=> source.embedding as distance
    from public.location_images li cross join source
    where source.embedding is not null
      and extensions.vector_norm(source.embedding) > 0
      and li.embedding is not null
      and li.embedding_model = expected_embedding_model
      and li.location_id <> source_location_id
      and not (li.location_id = any(coalesce(excluded_location_ids, '{}'::uuid[])))
      and 1 - (li.embedding <=> source.embedding) >= greatest(0, least(match_threshold, 1))
    order by li.location_id, li.embedding <=> source.embedding, li.id
  )
  select id, best_images.location_id, (1 - distance)::double precision
  from best_images
  order by distance, best_images.location_id, id
  limit least(greatest(match_count, 1), 200);
$$;
grant execute on function public.match_similar_locations_filtered(uuid, double precision, integer, text, uuid[]) to anon, authenticated;
