ALTER TABLE "Vehicle" ADD COLUMN "scrapeStatus" TEXT NOT NULL DEFAULT 'pending';
-- Backfill all pre-existing rows to 'complete' so historical inventory is not treated as pending
UPDATE "Vehicle" SET "scrapeStatus" = 'complete';
