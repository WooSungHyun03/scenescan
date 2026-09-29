do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.locations'::regclass
      and conname = 'locations_region_check'
  ) then
    alter table public.locations drop constraint locations_region_check;
  end if;
end $$;

alter table public.locations
  add constraint locations_region_check
  check (region in (
    '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주'
  ));

create index if not exists location_images_embedding_hnsw_idx
  on public.location_images
  using hnsw (embedding extensions.vector_cosine_ops)
  with (m = 16, ef_construction = 64)
  where embedding is not null;

analyze public.locations;
analyze public.location_images;
