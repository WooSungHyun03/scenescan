-- Backend-owned follow-up to 20260920000000_initial_schema.sql.
-- Adds import/freshness provenance (aligned with scripts/data
-- DataProvenance), embedding provenance, image de-duplication, and
-- updated_at tracking. Does not touch RLS read policies or the
-- match_location_images RPC contract.
--
-- Retimestamped to run after 20261001000000_location_attribution.sql
-- (origin/main) during the feat/backend-supabase merge, since that
-- migration already exists on the real deployed project and this one does
-- not (verified: this branch's migrations had never been applied anywhere
-- before the merge). locations.last_verified_at and location_images.source
-- are therefore NOT re-added here -- 20261001000000_location_attribution.sql
-- already creates them. See the merge report for the full analysis: this
-- migration originally named its own batch-provenance column
-- `locations.source`, which collided in *meaning* (not SQL) with
-- 20261001000000_location_attribution.sql's `locations.source` ("human-
-- readable source of the location metadata", shown to end users). Renamed
-- to `locations.import_batch` here to remove that collision; the two
-- `source` columns from the attribution migration keep their attribution
-- meaning exclusively.

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

-- locations: which scripts/data import batch last wrote this row, plus
-- updated_at. (reference_date/last_verified_at were going to live here too,
-- but last_verified_at now comes from 20261001000000_location_attribution.sql
-- -- see note above -- and reference_date is still added below since that
-- migration does not create it.)
--
-- Column name/meaning mirrors scripts/data/contracts.ts DataProvenance.source
-- (which scripts/data/normalizer.ts produces per location and per parking
-- record), deliberately renamed off the plain `source` name to avoid
-- colliding with 20261001000000_location_attribution.sql's
-- user-facing-attribution `locations.source`. There is no separate
-- source_id column: normalizeRecordWithCategory assigns an optional
-- pre-generated UUID as the canonical record's own `id` (validated in
-- scripts/data/validator.ts), so the existing locations.id primary key is
-- the upsert key scripts/data/location-importer.ts already uses.
-- Nullable, no default: origin/main's own production data pipeline
-- (scripts/data/production-importer.ts) writes `locations` rows directly
-- and has no concept of a scripts/data import batch, so it never sets this
-- column -- a NOT NULL default would mislabel every one of its rows as
-- 'manual', which is simply false. Null here means "not written by
-- scripts/data's batch importer", which is an accurate, not a missing, fact.
alter table public.locations
  add column import_batch text,
  add column reference_date date,
  add column updated_at timestamptz not null default now();

comment on column public.locations.import_batch is
  'Dataset/batch name that produced this row via scripts/data (DataProvenance.source), e.g. a scripts/data source key. Null means this row was not written by scripts/data (e.g. origin/main''s production-importer.ts). Distinct from locations.source (added by 20261001000000_location_attribution.sql), which is the human-readable, user-facing attribution source -- these are two different concepts that happen to share the word "source".';
comment on column public.locations.reference_date is
  'Date the source dataset describes this location as of (DataProvenance.referenceDate), when the source is a dated snapshot rather than live.';

create trigger locations_set_updated_at
  before update on public.locations
  for each row execute function public.set_updated_at();

-- location_images: embedding provenance, dedup, and updated_at. source
-- (attribution) already exists as of 20261001000000_location_attribution.sql
-- -- not re-added here.
alter table public.location_images
  add column embedding_model text not null default 'Xenova/clip-vit-base-patch32@main',
  add column storage_path text,
  add column updated_at timestamptz not null default now();

comment on column public.location_images.embedding_model is
  'Model ID (+ revision) that produced this row''s embedding, e.g. Xenova/clip-vit-base-patch32@main. Runtime and offline embeddings must share this value or ranking quality degrades silently. Default matches src/lib/ai/embedding-service.ts CLIP_MODEL_ID/CLIP_MODEL_REVISION as of this migration; confirm against the offline importer before real data import (see report).';
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
-- (initial migration, a plain free-text label -- not part of the
-- locations/location_images attribution-vs-import-batch collision above,
-- since parking is untouched by 20261001000000_location_attribution.sql)
-- and lines up with scripts/data DataProvenance.source for
-- CanonicalParkingRecord; these two columns cover the remaining
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
