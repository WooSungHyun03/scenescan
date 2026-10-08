-- Busan district contract (P0): narrows the region/district dimension of
-- search and browse from all 17 first-level regions to Busan's 16 구/군.
-- Past migrations are not edited -- this is purely additive: a new nullable
-- column + constraints + index on `locations`, and two RPC signatures
-- extended with one new optional parameter each, following the same
-- drop-then-recreate convention 20261002000001_match_location_images_filtered_model.sql
-- used to add expected_embedding_model (PostgREST can otherwise see two
-- overloads of the same name and reject an ambiguous named-parameter call).
--
-- See docs/database.md and docs/search-ranking.md for the full contract,
-- and src/types/location-options.ts for the single source of truth for the
-- 16 district keys (DISTRICT_VALUES/DISTRICT_LABELS) that the check
-- constraint below must stay in sync with.

alter table public.locations
  add column if not exists district text;

-- A location's district is never guessed. null means "구/군 unconfirmed from
-- the source address" (see docs/database.md) -- those rows are deliberately
-- excluded from a specific-district filter and only surface in an
-- unfiltered ("부산 전체") listing/search, the same null-means-unrestricted
-- convention match_location_images_filtered already uses for filter_region/
-- filter_category.
alter table public.locations
  add constraint locations_district_check
  check (district is null or district in (
    'busan_jung_gu', 'busan_seo_gu', 'busan_dong_gu', 'busan_yeongdo_gu',
    'busan_busanjin_gu', 'busan_dongnae_gu', 'busan_nam_gu', 'busan_buk_gu',
    'busan_haeundae_gu', 'busan_saha_gu', 'busan_geumjeong_gu', 'busan_gangseo_gu',
    'busan_yeonje_gu', 'busan_suyeong_gu', 'busan_sasang_gu', 'busan_gijang_gun'
  ));

-- A district value only ever makes sense for a Busan row. This does not by
-- itself restrict the table to Busan-only rows (the existing 17-region
-- check constraint on `region` is untouched -- see docs/database.md for why
-- 부산-only scope is enforced by the application/RPC layer passing a fixed
-- '부산' value, not by deleting or rejecting the remaining non-Busan catalog
-- rows here); it only guarantees district and region can never disagree.
alter table public.locations
  add constraint locations_district_requires_busan_region
  check (district is null or region = '부산');

create index if not exists locations_district_category_idx
  on public.locations (district, category);

-- Extends 20261002000001_match_location_images_filtered_model.sql's 6-arg
-- signature with filter_district, applied in the same WHERE clause (before
-- the per-location DISTINCT ON / LIMIT) as filter_region/filter_category --
-- same null-means-unrestricted convention, SQL-side so a district filter
-- can never starve a match the way a post-hoc app-side filter could.
drop function if exists public.match_location_images_filtered(extensions.vector, double precision, integer, text, text, text);

create or replace function public.match_location_images_filtered(
  query_embedding extensions.vector(512),
  match_threshold double precision default 0,
  match_count integer default 8,
  filter_region text default null,
  filter_category text default null,
  expected_embedding_model text default null,
  filter_district text default null
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
      and (filter_district is null or l.district = filter_district)
      and 1 - (li.embedding <=> query_embedding) >= greatest(0, least(match_threshold, 1))
    order by li.location_id, li.embedding <=> query_embedding, li.id
  )
  select id, best_images.location_id, (1 - distance)::double precision
  from best_images
  order by distance, best_images.location_id, id
  limit least(greatest(match_count, 1), 200);
$$;

grant execute on function public.match_location_images_filtered(extensions.vector, double precision, integer, text, text, text, text) to anon, authenticated;

-- Extends 20261004000002_model_safe_similar_search.sql's signature with
-- filter_region/filter_district. Unlike match_location_images_filtered,
-- the previous version of this RPC never joined `locations` at all, so a
-- Busan location's "similar" results could surface a non-Busan match --
-- the gap requirement 3 of the district contract closes. Application code
-- always passes filter_region = '부산' (src/domains/locations/server/
-- supabase-repository.ts); filter_district stays unexposed to clients today
-- (GET /api/locations/[id]/similar has no district query param) but is
-- threaded through now so a future "비슷한 장소" district filter does not
-- need a third RPC signature change.
drop function if exists public.match_similar_locations_filtered(uuid, double precision, integer, text, uuid[]);

create or replace function public.match_similar_locations_filtered(
  source_location_id uuid,
  match_threshold double precision default 0,
  match_count integer default 8,
  expected_embedding_model text default null,
  excluded_location_ids uuid[] default '{}'::uuid[],
  filter_region text default null,
  filter_district text default null
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
    from public.location_images li
    cross join source
    join public.locations l on l.id = li.location_id
    where source.embedding is not null
      and extensions.vector_norm(source.embedding) > 0
      and li.embedding is not null
      and li.embedding_model = expected_embedding_model
      and li.location_id <> source_location_id
      and not (li.location_id = any(coalesce(excluded_location_ids, '{}'::uuid[])))
      and (filter_region is null or l.region = filter_region)
      and (filter_district is null or l.district = filter_district)
      and 1 - (li.embedding <=> source.embedding) >= greatest(0, least(match_threshold, 1))
    order by li.location_id, li.embedding <=> source.embedding, li.id
  )
  select id, best_images.location_id, (1 - distance)::double precision
  from best_images
  order by distance, best_images.location_id, id
  limit least(greatest(match_count, 1), 200);
$$;

grant execute on function public.match_similar_locations_filtered(uuid, double precision, integer, text, uuid[], text, text) to anon, authenticated;
