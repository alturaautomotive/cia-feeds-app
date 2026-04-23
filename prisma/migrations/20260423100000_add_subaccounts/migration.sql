-- CreateTable
CREATE TABLE "SubAccount" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "vertical" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stripeSubId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubAccount_pkey" PRIMARY KEY ("id")
);

-- AddColumn: Dealer.defaultSubAccountId
ALTER TABLE "Dealer" ADD COLUMN "defaultSubAccountId" TEXT;

-- AddColumn: Vehicle.subAccountId
ALTER TABLE "Vehicle" ADD COLUMN "subAccountId" TEXT;

-- AddColumn: Listing.subAccountId
ALTER TABLE "Listing" ADD COLUMN "subAccountId" TEXT;

-- AddColumn: CrawlJob.subAccountId
ALTER TABLE "CrawlJob" ADD COLUMN "subAccountId" TEXT;

-- AddColumn: CrawlSnapshot.subAccountId
ALTER TABLE "CrawlSnapshot" ADD COLUMN "subAccountId" TEXT;

-- CreateIndex
CREATE INDEX "SubAccount_dealerId_idx" ON "SubAccount"("dealerId");

-- CreateIndex
CREATE INDEX "Vehicle_subAccountId_idx" ON "Vehicle"("subAccountId");

-- CreateIndex
CREATE INDEX "Listing_subAccountId_idx" ON "Listing"("subAccountId");

-- CreateIndex
CREATE INDEX "CrawlJob_subAccountId_idx" ON "CrawlJob"("subAccountId");

-- CreateIndex
CREATE INDEX "CrawlSnapshot_subAccountId_idx" ON "CrawlSnapshot"("subAccountId");

-- AddForeignKey
ALTER TABLE "SubAccount" ADD CONSTRAINT "SubAccount_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "SubAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "SubAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawlJob" ADD CONSTRAINT "CrawlJob_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "SubAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawlSnapshot" ADD CONSTRAINT "CrawlSnapshot_subAccountId_fkey" FOREIGN KEY ("subAccountId") REFERENCES "SubAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enable uuid-ossp extension (idempotent)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create default subaccounts for each existing dealer
INSERT INTO "SubAccount" ("id", "dealerId", "vertical", "name", "createdAt")
SELECT uuid_generate_v4(), "id", "vertical", 'Default ' || "vertical" || ' Account', now()
FROM "Dealer";

-- Set defaultSubAccountId on each Dealer to their newly created SubAccount
UPDATE "Dealer" SET "defaultSubAccountId" = (
    SELECT "id" FROM "SubAccount" WHERE "SubAccount"."dealerId" = "Dealer"."id" LIMIT 1
);

-- Reparent Vehicle rows to their dealer's default subaccount
UPDATE "Vehicle" SET "subAccountId" = (
    SELECT "id" FROM "SubAccount" WHERE "SubAccount"."dealerId" = "Vehicle"."dealerId" LIMIT 1
) WHERE "dealerId" IS NOT NULL;

-- Reparent Listing rows
UPDATE "Listing" SET "subAccountId" = (
    SELECT "id" FROM "SubAccount" WHERE "SubAccount"."dealerId" = "Listing"."dealerId" LIMIT 1
) WHERE "dealerId" IS NOT NULL;

-- Reparent CrawlJob rows
UPDATE "CrawlJob" SET "subAccountId" = (
    SELECT "id" FROM "SubAccount" WHERE "SubAccount"."dealerId" = "CrawlJob"."dealerId" LIMIT 1
) WHERE "dealerId" IS NOT NULL;

-- Reparent CrawlSnapshot rows
UPDATE "CrawlSnapshot" SET "subAccountId" = (
    SELECT "id" FROM "SubAccount" WHERE "SubAccount"."dealerId" = "CrawlSnapshot"."dealerId" LIMIT 1
) WHERE "dealerId" IS NOT NULL;
