-- AlterTable: make vehicleId nullable on Lead
ALTER TABLE "Lead" ALTER COLUMN "vehicleId" DROP NOT NULL;

-- AddColumn: add listingId to Lead
ALTER TABLE "Lead" ADD COLUMN "listingId" TEXT;

-- AddForeignKey: Lead.listingId -> Listing.id
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex: index on Lead.listingId
CREATE INDEX "Lead_listingId_idx" ON "Lead"("listingId");
