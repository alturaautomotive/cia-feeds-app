-- AlterTable
ALTER TABLE "Vehicle" ADD COLUMN "urlStatus" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "Vehicle" ADD COLUMN "urlLastCheckedAt" TIMESTAMP(3);
ALTER TABLE "Vehicle" ADD COLUMN "urlCheckFailed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Dealer" ADD COLUMN "urlHealthCheckEnabled" BOOLEAN NOT NULL DEFAULT true;
