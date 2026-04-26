-- AlterTable
ALTER TABLE "Dealer" ADD COLUMN "metaTokenType" TEXT,
ADD COLUMN "metaTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "metaCatalogOwnership" TEXT,
ADD COLUMN "metaAdAccountId" TEXT,
ADD COLUMN "metaConnectedAt" TIMESTAMP(3),
ADD COLUMN "metaDeliveryMethod" TEXT NOT NULL DEFAULT 'csv';
