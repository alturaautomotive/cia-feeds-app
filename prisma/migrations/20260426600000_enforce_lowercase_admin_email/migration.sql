-- Re-normalize any mixed-case emails that may have been inserted since the last migration
UPDATE "AdminAllowlist" SET "email" = LOWER(TRIM("email")) WHERE "email" != LOWER(TRIM("email"));

-- Add CHECK constraint to enforce lowercase storage for all future writes
ALTER TABLE "AdminAllowlist" ADD CONSTRAINT "AdminAllowlist_email_lowercase_check" CHECK ("email" = LOWER(TRIM("email")));
