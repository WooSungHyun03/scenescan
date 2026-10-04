-- Static parking metadata collected from reviewed official public datasets.
-- `location_id` remains the location this option is shown for; relationship
-- records whether the facility is on site or merely nearby.
alter table public.parking
  add column relationship text not null default 'nearby'
    check (relationship in ('on_site', 'nearby')),
  add column source_url text
    check (source_url is null or source_url ~ '^https?://');

comment on column public.parking.relationship is
  'Reviewed relationship to the SceneScan location: on_site or nearby. Never inferred by the runtime UI.';
comment on column public.parking.source_url is
  'Official source record or dataset URL for this static parking information.';

-- Keep the existing public read-only policy from the initial migration
-- active after this schema change. Writes continue to require service role.
alter table public.parking enable row level security;
