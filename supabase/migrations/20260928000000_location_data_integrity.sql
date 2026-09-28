-- Backend-owned follow-up to 20260920000000_initial_schema.sql.
-- Adds source/freshness provenance (aligned with scripts/data
-- DataProvenance), embedding provenance, image de-duplication, and
-- updated_at tracking. Does not touch RLS read policies or the
-- match_location_images RPC contract.

-- updated_at auto-refresh trigger, shared by all three tables.
create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- locations: provenance/freshness for re-running the offline data importer,
-- plus verification freshness for permit/contact info.
--
-- Column names and meaning mirror scripts/data/contracts.ts DataProvenance
-- (source, sourceUrl, referenceDate, lastVerifiedAt), which
-- scripts/data/normalizer.ts already produces per location and per parking
-- record. sourceUrl already exists as locations.source_url from the initial
-- migration. There is no separate source_id column: normalizeRecordWithCategory
-- assigns an optional pre-generated UUID as the canonical record's own `id`
-- (validated in scripts/data/validator.ts), so the existing locations.id
-- primary key is the intended upsert key once a Supabase-writing importer is
-- built for scripts/data output, the same way scripts/embeddings/importer.ts
-- upserts location_images by id. See report for the open question this raises.
alter table public.locations
  add column source text not null default 'manual',
  add column reference_date date,
  add column last_verified_at timestamptz,
  add column updated_at timestamptz not null default now();

comment on column public.locations.source is
  'Dataset/batch name that produced this row (scripts/data DataProvenance.source), e.g. a scripts/data source key. Default manual covers hand-entered rows that predate source tracking.';
comment on column public.locations.reference_date is
  'Date the source dataset describes this location as of (DataProvenance.referenceDate), when the source is a dated snapshot rather than live.';
comment on column public.locations.last_verified_at is
  'When this row (permit/contact/noise info in particular) was last human-verified (DataProvenance.lastVerifiedAt). Null means never verified, matching the "정보 확인 필요" permit_type default.';

create trigger locations_set_updated_at
  before update on public.locations
  for each row execute function public.set_updated_at();

-- location_images: embedding provenance, dedup, and updated_at.
alter table public.location_images
  add column embedding_model text not null default 'Xenova/clip-vit-base-patch32@main',
  add column source text,
  add column storage_path text,
  add column updated_at timestamptz not null default now();

comment on column public.location_images.embedding_model is
  'Model ID (+ revision) that produced this row''s embedding, e.g. Xenova/clip-vit-base-patch32@main. Runtime and offline embeddings must share this value or ranking quality degrades silently. Default matches src/lib/ai/embedding-service.ts CLIP_MODEL_ID/CLIP_MODEL_REVISION as of this migration; confirm against the offline importer before real data import (see report).';
comment on column public.location_images.source is
  'Where this image file came from (e.g. a scripts/data source key or manual upload), independent of locations.source.';
comment on column public.location_images.storage_path is
  'Path in Supabase Storage when the image is hosted there; null if image_url points elsewhere. Used for de-duplication together with location_id.';

-- Prevents importing the same stored file twice for one location. Left
-- partial (where storage_path is not null) so image_url-only rows, which
-- the current importer writes, are unaffected until storage_path is wired up.
create unique index location_images_location_storage_path_key
  on public.location_images (location_id, storage_path)
  where storage_path is not null;

create trigger location_images_set_updated_at
  before update on public.location_images
  for each row execute function public.set_updated_at();

-- parking: data freshness and updated_at. parking.source already exists
-- (initial migration) and lines up with scripts/data DataProvenance.source
-- for CanonicalParkingRecord; these two columns cover the remaining
-- DataProvenance fields (referenceDate, lastVerifiedAt) for parking.
alter table public.parking
  add column last_verified_at timestamptz,
  add column reference_date date,
  add column updated_at timestamptz not null default now();

comment on column public.parking.last_verified_at is
  'When this parking record (capacity, hours, price) was last confirmed accurate (DataProvenance.lastVerifiedAt).';
comment on column public.parking.reference_date is
  'Date the underlying source data (e.g. a public parking dataset snapshot) describes, when the source is dated rather than live (DataProvenance.referenceDate).';

create trigger parking_set_updated_at
  before update on public.parking
  for each row execute function public.set_updated_at();
