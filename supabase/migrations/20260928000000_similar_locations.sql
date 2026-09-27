create or replace function public.match_similar_location_images(
  source_location_id uuid,
  match_threshold double precision default 0,
  match_count integer default 40
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
  )
  select li.id, li.location_id, (1 - (li.embedding <=> source.embedding))::double precision
  from public.location_images li
  cross join source
  where source.embedding is not null
    and li.embedding is not null
    and li.location_id <> source_location_id
    and 1 - (li.embedding <=> source.embedding) >= greatest(0, least(match_threshold, 1))
  order by li.embedding <=> source.embedding, li.location_id, li.id
  limit least(greatest(match_count, 1), 200);
$$;

grant execute on function public.match_similar_location_images(uuid, double precision, integer) to anon, authenticated;
