-- Removes the noise feature entirely (P0 noise-source removal). Past
-- migrations are not edited -- 20260920000000_initial_schema.sql still shows
-- the column being created and 20261004000001_structured_noise_sources.sql
-- still shows the structured-contract check being added; this migration is
-- purely the additive undo of both, in reverse dependency order
-- (constraint -> function -> column).
--
-- See docs/database.md's migration 18 entry for the full contract note.

alter table public.locations
  drop constraint if exists locations_noise_sources_contract_check;

drop function if exists public.is_valid_noise_sources(jsonb);

alter table public.locations
  drop column if exists noise_sources;
