alter table public.locations
  add column if not exists source text,
  add column if not exists author text,
  add column if not exists license text,
  add column if not exists license_url text,
  add column if not exists last_verified_at timestamptz;

alter table public.location_images
  add column if not exists source text,
  add column if not exists source_url text,
  add column if not exists author text,
  add column if not exists license text,
  add column if not exists license_url text,
  add column if not exists last_verified_at timestamptz;

alter table public.locations
  add constraint locations_source_url_http_check
    check (source_url is null or source_url ~* '^https?://') not valid,
  add constraint locations_license_url_http_check
    check (license_url is null or license_url ~* '^https?://') not valid;

alter table public.locations
  validate constraint locations_source_url_http_check,
  validate constraint locations_license_url_http_check;

alter table public.location_images
  add constraint location_images_source_url_http_check
    check (source_url is null or source_url ~* '^https?://') not valid,
  add constraint location_images_license_url_http_check
    check (license_url is null or license_url ~* '^https?://') not valid;

alter table public.location_images
  validate constraint location_images_source_url_http_check,
  validate constraint location_images_license_url_http_check;

comment on column public.locations.source is 'Human-readable source of the location metadata';
comment on column public.locations.source_url is 'Official or primary source URL for the location metadata';
comment on column public.locations.last_verified_at is 'Timestamp when the location source was last checked';
comment on column public.location_images.source is 'Human-readable source of the individual image';
comment on column public.location_images.source_url is 'Original page for the individual image';
comment on column public.location_images.author is 'Image creator or credited author as supplied by the source';
comment on column public.location_images.license is 'Image license label as supplied by the source';
comment on column public.location_images.license_url is 'Canonical license terms URL';
comment on column public.location_images.last_verified_at is 'Timestamp when the image attribution was last checked';
