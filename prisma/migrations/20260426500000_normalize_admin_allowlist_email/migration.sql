-- Normalize existing AdminAllowlist emails to lowercase
UPDATE "AdminAllowlist" SET "email" = LOWER("email");

-- Drop the existing case-sensitive unique index
DROP INDEX "AdminAllowlist_email_key";

-- Create a case-insensitive unique index to prevent duplicate-case variants
CREATE UNIQUE INDEX "AdminAllowlist_email_key" ON "AdminAllowlist" (LOWER("email"));
