-- Harden the vehicle-images bucket (SECURITY_AUDIT.md F-3.3).
--
-- Issues we are fixing:
--   1. file_size_limit was NULL (unlimited upload size).
--   2. allowed_mime_types was NULL (any content-type accepted).
--   3. SELECT policy granted to 'public' role over the whole bucket,
--      allowing arbitrary enumeration of all uploaded files via the storage
--      list API.
--
-- Public files remain reachable via the standard Supabase public CDN URL
-- (it doesn't consult storage.objects RLS for unsigned public URLs on
-- public buckets). Only LIST/enumeration is restricted.

-- 1. Cap upload size + restrict MIME types.
UPDATE storage.buckets
SET file_size_limit = 10485760,  -- 10 MB
    allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif','image/avif']
WHERE id = 'vehicle-images';

-- 2. Tighten upload policy: still allow authenticated INSERT, but only into
--    known folders we actually use (spotlights, profiles, listings, vehicles)
--    or under a dealer-id-shaped folder name (UUID, for legacy paths).
DROP POLICY IF EXISTS "Allow authenticated users to upload ur1et5_0" ON storage.objects;
CREATE POLICY "vehicle_images_authenticated_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vehicle-images'
    AND (
      (storage.foldername(name))[1] IN ('spotlights','profiles','listings','vehicles')
      OR (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    )
  );

-- 3. Replace the broad SELECT-to-public policy with one that allows
--    individual-file reads but not LIST enumeration. We do this by gating
--    SELECT on the same folder structure: a known UUID-shaped folder
--    prefix means the caller already knew the path — they're not just
--    enumerating the bucket.
DROP POLICY IF EXISTS "Allow public read access ur1et5_0" ON storage.objects;
-- No new SELECT policy is needed: Supabase's public CDN serves files at
-- {project}.supabase.co/storage/v1/object/public/{bucket}/{path} without
-- consulting storage.objects RLS. By omitting a SELECT-to-public policy
-- we deny LIST while preserving public file fetches via the CDN.
-- (Service-role and the Prisma postgres user bypass RLS for any
-- internal listing needed.)
