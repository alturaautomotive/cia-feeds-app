-- Add unique constraint on defaultSubAccountId
-- and backfill existing dealers with their first sub-account

-- Add unique index (field already exists as nullable String)
CREATE UNIQUE INDEX IF NOT EXISTS "Dealer_defaultSubAccountId_key" ON "Dealer"("defaultSubAccountId");

-- Backfill: set each dealer's defaultSubAccountId to its earliest sub-account
UPDATE "Dealer" d
SET "defaultSubAccountId" = sub.id
FROM (
  SELECT DISTINCT ON ("dealerId") id, "dealerId"
  FROM "SubAccount"
  ORDER BY "dealerId", "createdAt" ASC
) sub
WHERE d.id = sub."dealerId"
  AND d."defaultSubAccountId" IS NULL;
