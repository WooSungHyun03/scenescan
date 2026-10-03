alter table public.locations
  add column if not exists permit_source text,
  add column if not exists permit_source_url text,
  add column if not exists permit_reference_date date,
  add column if not exists permit_last_verified_at timestamptz;

alter table public.locations
  drop constraint if exists locations_permit_source_url_http,
  add constraint locations_permit_source_url_http
    check (permit_source_url is null or permit_source_url ~* '^https?://'),
  drop constraint if exists locations_contact_phone_format,
  add constraint locations_contact_phone_format
    check (
      contact_phone is null
      or (
        contact_phone ~ '^\+?[0-9][0-9() .-]{5,23}$'
        and length(regexp_replace(contact_phone, '[^0-9]', '', 'g')) between 7 and 15
      )
    );

comment on column public.locations.permit_source is
  'Official organization or public source for filming guidance; independent from the general location source.';
comment on column public.locations.permit_source_url is
  'Official filming guidance or contact page. Null when no official page has been verified.';
comment on column public.locations.permit_reference_date is
  'Date or season represented by the source content, used to surface old conditions.';
comment on column public.locations.permit_last_verified_at is
  'Timestamp when SceneScan last checked that the official permit source and contact details matched.';
