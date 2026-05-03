-- Backfill: existing TeamUser rows keep `passwordHash = NULL` and are inert;
-- the dealer must re-invite them via the new resend endpoint to grant login access.

ALTER TABLE "TeamUser" ADD COLUMN "name" TEXT;
ALTER TABLE "TeamUser" ADD COLUMN "passwordHash" TEXT;
CREATE INDEX "TeamUser_email_idx" ON "TeamUser"("email");
