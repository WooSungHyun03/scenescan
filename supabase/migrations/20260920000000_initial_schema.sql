create extension if not exists vector with schema extensions;

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  category text not null check (category in ('urban', 'nature', 'industrial', 'interior')),
  region text not null check (region in ('서울', '부산', '인천', '경기')),
  address text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  permit_type text not null default '정보 확인 필요',
  contact_name text,
  contact_phone text,
  permit_note text,
  noise_sources jsonb not null default '[]'::jsonb,
  source_url text,
  created_at timestamptz not null default now()
);

create table public.location_images (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  image_url text not null,
  alt text,
  embedding extensions.vector(512),
  created_at timestamptz not null default now()
);

create table public.parking (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references public.locations(id) on delete set null,
  name text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  capacity integer check (capacity >= 0),
  opening_hours text,
  price_info text,
  source text,
  created_at timestamptz not null default now()
);

create index locations_region_category_idx on public.locations (region, category);
create index location_images_location_id_idx on public.location_images (location_id);
create index parking_location_id_idx on public.parking (location_id);

alter table public.locations enable row level security;
alter table public.location_images enable row level security;
alter table public.parking enable row level security;

create policy "public can read locations" on public.locations for select to anon, authenticated using (true);
create policy "public can read location images" on public.location_images for select to anon, authenticated using (true);
create policy "public can read parking" on public.parking for select to anon, authenticated using (true);

create function public.match_location_images(
  query_embedding extensions.vector(512),
  match_threshold double precision default 0,
  match_count integer default 40
)
returns table (location_image_id uuid, location_id uuid, similarity double precision)
language sql stable security invoker
set search_path = public, extensions
as $$
  select li.id, li.location_id, (1 - (li.embedding <=> query_embedding))::double precision
  from public.location_images li
  where li.embedding is not null
    and 1 - (li.embedding <=> query_embedding) >= greatest(0, least(match_threshold, 1))
  order by li.embedding <=> query_embedding
  limit least(greatest(match_count, 1), 200);
$$;

grant execute on function public.match_location_images(extensions.vector, double precision, integer) to anon, authenticated;
