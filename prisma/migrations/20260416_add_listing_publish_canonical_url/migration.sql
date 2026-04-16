-- AlterTable
ALTER TABLE "Listing" ADD COLUMN "publishStatus" TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE "Listing" ADD COLUMN "urlValidationScore" DOUBLE PRECISION;
ALTER TABLE "Listing" ADD COLUMN "canonicalUrl" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Listing_dealerId_canonicalUrl_key" ON "Listing"("dealerId", "canonicalUrl");
