-- ============================================================
-- Reconciliation migration (May 15, 2026)
--
-- Background: a sequence of failed/re-applied Prisma migrations on
-- May 1, 2026 left the production DB in a state where Prisma believed
-- 22+ migrations had been applied (applied_steps_count=0 rows in
-- _prisma_migrations) while in reality some of their SQL did execute
-- (columns are present) and some did not (a handful of tables/columns
-- were missing). The production app was silently logging Postgres
-- errors on every Stripe webhook, password reset, and team-member
-- login since.
--
-- This migration adds only what was actually missing, using IF NOT
-- EXISTS guards everywhere so it's safe to run against any state.
--
-- Missing pieces fixed (confirmed via information_schema diff vs schema.prisma):
--   1. Table public."PasswordResetToken"
--   2. Table public."StripeWebhookEvent"
--   3. Column public."TeamUser"."name"
--   4. Column public."TeamUser"."passwordHash"
--   5. Index TeamUser_email_idx
--   6. Column public."Lead"."listingId" + its FK + index + nullable vehicleId
--
-- Applied directly via Supabase MCP on 2026-05-15. The _prisma_migrations
-- history was simultaneously cleaned up to mark all 47 migrations as
-- applied_steps_count=1 so future `prisma migrate deploy` runs report
-- "Database schema is up to date" without re-attempting any of them.
-- ============================================================

-- 1. PasswordResetToken table
CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
  "id"        TEXT NOT NULL,
  "email"     TEXT NOT NULL,
  "token"     TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PasswordResetToken_token_key"
  ON "PasswordResetToken" ("token");
ALTER TABLE "PasswordResetToken" ENABLE ROW LEVEL SECURITY;

-- 2. StripeWebhookEvent table
CREATE TABLE IF NOT EXISTS "StripeWebhookEvent" (
  "id"          TEXT NOT NULL,
  "type"        TEXT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "StripeWebhookEvent" ENABLE ROW LEVEL SECURITY;

-- 3+4. TeamUser.name + passwordHash + email index
ALTER TABLE "TeamUser"
  ADD COLUMN IF NOT EXISTS "name"         TEXT,
  ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
CREATE INDEX IF NOT EXISTS "TeamUser_email_idx" ON "TeamUser" ("email");

-- 6. Lead.listingId + FK + index + nullable vehicleId
ALTER TABLE "Lead"
  ADD COLUMN IF NOT EXISTS "listingId" TEXT;
ALTER TABLE "Lead" ALTER COLUMN "vehicleId" DROP NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Lead_listingId_fkey'
  ) THEN
    ALTER TABLE "Lead"
      ADD CONSTRAINT "Lead_listingId_fkey"
      FOREIGN KEY ("listingId") REFERENCES "Listing"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Lead_listingId_idx" ON "Lead" ("listingId");
