-- Basic natural-language text search (P0). Adds reviewed alias/tag
-- metadata to `locations` and a parameterized, ILIKE-pattern-escaped RPC
-- that matches keywords against name/aliases/description/tags, filtered
-- and limited entirely in SQL (same "filter before LIMIT" discipline as
-- the image-search RPCs -- see docs/search-ranking.md). Past migrations
-- are not edited.

alter table public.locations
  add column if not exists aliases text[] not null default '{}'::text[];

alter table public.locations
  add column if not exists tags text[] not null default '{}'::text[];

comment on column public.locations.aliases is
  'Reviewed alternate names (e.g. a neighborhood name) searched by search_locations_by_text.';
comment on column public.locations.tags is
  'Reviewed short descriptive tags searched by search_locations_by_text.';

-- Escapes a raw keyword for safe use inside an ILIKE pattern. Parameter
-- binding (this is a plain SQL argument, never string-concatenated into
-- the query) already prevents SQL injection; this is a separate
-- correctness concern -- a keyword containing %, _, or \ must match that
-- literal character, not act as an ILIKE wildcard. Postgres's default LIKE
-- escape character is already backslash, so escaping \ to \\ and %/_ to
-- \%/\_ here is sufficient without an explicit ESCAPE clause at the call site.
create or replace function public.escape_ilike_pattern(value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(replace(value, '\', '\\'), '%', '\%'), '_', '\_');
$$;

-- `keywords` is matched as "every element must hit at least one of
-- name/aliases/description/tags" per unit of score (score = count of
-- keywords with at least one hit); an empty keywords array matches every
-- row in scope (district/category act as the only filter) rather than
-- zero rows. filter_region/filter_district/filter_category all follow the
-- same null-means-unrestricted convention as match_location_images_filtered
-- (see docs/search-ranking.md); the application always passes
-- filter_region = '부산' explicitly (never null) for the length of the
-- Busan-district transition, same as every other search RPC.
create or replace function public.search_locations_by_text(
  keywords text[] default '{}'::text[],
  filter_region text default null,
  filter_district text default null,
  filter_category text default null,
  match_count integer default 8
)
returns table (location_id uuid, score integer)
language sql stable security invoker
set search_path = public, extensions
as $$
  with scored as (
    select
      l.id as location_id,
      (
        select count(*)::int
        from unnest(keywords) as kw
        where length(trim(kw)) > 0
          and (
            l.name ilike '%' || public.escape_ilike_pattern(kw) || '%'
            or l.description ilike '%' || public.escape_ilike_pattern(kw) || '%'
            or exists (
              select 1 from unnest(l.aliases) as alias
              where alias ilike '%' || public.escape_ilike_pattern(kw) || '%'
            )
            or exists (
              select 1 from unnest(l.tags) as tag
              where tag ilike '%' || public.escape_ilike_pattern(kw) || '%'
            )
          )
      ) as score
    from public.locations l
    where (filter_region is null or l.region = filter_region)
      and (filter_district is null or l.district = filter_district)
      and (filter_category is null or l.category = filter_category)
  )
  select location_id, score
  from scored
  where cardinality(keywords) = 0 or score > 0
  order by score desc, location_id asc
  limit least(greatest(match_count, 1), 8);
$$;

grant execute on function public.escape_ilike_pattern(text) to anon, authenticated;
grant execute on function public.search_locations_by_text(text[], text, text, text, integer) to anon, authenticated;
