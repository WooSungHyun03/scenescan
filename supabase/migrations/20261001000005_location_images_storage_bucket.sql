-- Backend-owned: Storage bucket for licensed location images (see
-- docs/data-pipeline.md for the storage strategy this backs). Public read
-- (anyone can view a published image, same as any other row in this
-- public-read-only app), write only via the service role -- no
-- INSERT/UPDATE/DELETE policy is created for anon/authenticated, matching
-- every other table in this project (the service role bypasses RLS
-- entirely; see docs/database.md's "RLS verification" section for the same
-- pattern applied to locations/location_images/parking).
--
-- Not verifiable against the disposable `pgvector/pgvector` Postgres
-- containers used to check this project's other migrations: the `storage`
-- schema is a Supabase platform feature, not part of vanilla Postgres.
-- Verified instead against a real `supabase start` local Supabase stack
-- (which does provision `storage`) -- see
-- supabase/tests/schema-and-rls.integration.test.ts's "location-images
-- Storage bucket" block and docs/integration-testing.md: the bucket exists
-- and is public, an anon-key client's upload is rejected by RLS, and the
-- service role's upload succeeds and is then readable at its public URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'location-images',
  'location-images',
  true,
  15728640, -- 15 MB, matching MAX_IMAGE_BYTES in src/lib/ai/embedding-service.ts
  array['image/jpeg', 'image/png', 'image/webp'] -- matching SUPPORTED_IMAGE_MIME_TYPES, same file
)
on conflict (id) do nothing;

create policy "public can read location-images objects"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'location-images');
