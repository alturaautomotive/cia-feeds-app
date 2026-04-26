-- CreateTable
CREATE TABLE "MetaCatalogSyncItem" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "metaCatalogId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastDeletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaCatalogSyncItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MetaCatalogSyncItem_dealerId_metaCatalogId_catalogItemId_key" ON "MetaCatalogSyncItem"("dealerId", "metaCatalogId", "catalogItemId");

-- CreateIndex
CREATE INDEX "MetaCatalogSyncItem_dealerId_metaCatalogId_lastDeletedAt_idx" ON "MetaCatalogSyncItem"("dealerId", "metaCatalogId", "lastDeletedAt");

-- CreateIndex
CREATE INDEX "MetaCatalogSyncItem_dealerId_idx" ON "MetaCatalogSyncItem"("dealerId");

-- AddForeignKey
ALTER TABLE "MetaCatalogSyncItem" ADD CONSTRAINT "MetaCatalogSyncItem_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
