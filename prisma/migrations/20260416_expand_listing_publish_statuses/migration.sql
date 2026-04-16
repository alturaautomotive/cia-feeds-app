-- Expand allowed publishStatus values to cover the URL-first workflow states.
-- "blocked" is retained for backward compatibility with existing rows.
ALTER TABLE "Listing"
  ADD CONSTRAINT "Listing_publishStatus_check"
  CHECK ("publishStatus" IN ('draft', 'validated', 'ready_to_publish', 'published', 'blocked'));
