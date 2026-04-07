-- AlterTable: Add vertical column to Dealer
ALTER TABLE "Dealer" ADD COLUMN "vertical" TEXT NOT NULL DEFAULT 'automotive';

-- AlterTable: Add archivedAt column to Vehicle
ALTER TABLE "Vehicle" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateTable: Listing
CREATE TABLE "Listing" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "vertical" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" DOUBLE PRECISION,
    "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "url" TEXT,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "missingFields" TEXT[],
    "archivedAt" TIMESTAMP(3),
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Listing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Listing_dealerId_vertical_idx" ON "Listing"("dealerId", "vertical");
CREATE INDEX "Listing_dealerId_archivedAt_idx" ON "Listing"("dealerId", "archivedAt");
CREATE INDEX "Vehicle_dealerId_archivedAt_idx" ON "Vehicle"("dealerId", "archivedAt");

-- AddForeignKey
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
