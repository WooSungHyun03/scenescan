-- Preserve legacy string entries honestly, then require all future values to
-- use the structured expected-noise-source contract. Null provenance on a
-- legacy row means "unknown"; the migration never invents attribution.
update public.locations
set noise_sources = coalesce((
  select jsonb_agg(
    case
      when jsonb_typeof(item) = 'string' then jsonb_build_object(
        'kind', 'other',
        'description', trim(both '"' from item::text),
        'distanceMeters', null,
        'evidence', null,
        'source', null,
        'sourceUrl', null,
        'license', null,
        'licenseUrl', null,
        'referenceDate', null,
        'lastVerifiedAt', null
      )
      when jsonb_typeof(item) = 'object' and item ? 'note' and not item ? 'description' then jsonb_build_object(
        'kind', case when item->>'kind' in ('railway', 'major_road', 'airport', 'construction') then item->>'kind' else 'other' end,
        'description', item->>'note',
        'distanceMeters', null,
        'evidence', null,
        'source', null,
        'sourceUrl', null,
        'license', null,
        'licenseUrl', null,
        'referenceDate', null,
        'lastVerifiedAt', null
      )
      else item
    end
  )
  from jsonb_array_elements(public.locations.noise_sources) as item
), '[]'::jsonb)
where jsonb_typeof(noise_sources) = 'array';

create or replace function public.is_valid_noise_sources(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(value) = 'array'
    and not exists (
      select 1
      from jsonb_array_elements(value) as item
      where jsonb_typeof(item) <> 'object'
        or coalesce(item->>'kind', '') not in ('railway', 'major_road', 'airport', 'construction', 'other')
        or btrim(coalesce(item->>'description', '')) = ''
        or (
          item->>'kind' <> 'other'
          and (
            btrim(coalesce(item->>'source', '')) = ''
            or coalesce(item->>'sourceUrl', '') !~ '^https?://'
            or btrim(coalesce(item->>'license', '')) = ''
            or coalesce(item->>'licenseUrl', '') !~ '^https?://'
            or btrim(coalesce(item->>'lastVerifiedAt', '')) = ''
          )
        )
        or (
          coalesce(item->'distanceMeters', 'null'::jsonb) = 'null'::jsonb
          and nullif(btrim(coalesce(item->>'evidence', '')), '') is null
          and item->>'kind' <> 'other'
        )
        or case
          when coalesce(item->'distanceMeters', 'null'::jsonb) = 'null'::jsonb then false
          when jsonb_typeof(item->'distanceMeters') <> 'number' then true
          else (item->>'distanceMeters')::numeric < 0
        end
    );
$$;

alter table public.locations
  drop constraint if exists locations_noise_sources_contract_check;

alter table public.locations
  add constraint locations_noise_sources_contract_check
  check (public.is_valid_noise_sources(noise_sources));

comment on column public.locations.noise_sources is
  'Static expected environmental noise sources only. No measured or predicted dB values. New records require source, URL, license, verification date, and distance or evidence.';

alter table public.locations enable row level security;
