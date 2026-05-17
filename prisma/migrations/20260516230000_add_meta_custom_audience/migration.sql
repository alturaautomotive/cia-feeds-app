-- Meta Custom Audience tracking table. One row per dealer-audience tuple.
-- Created idempotently for production-safe re-runs.

CREATE TABLE IF NOT EXISTS "MetaCustomAudience" (
  "id" TEXT NOT NULL,
  "dealerId" TEXT NOT NULL,
  "audienceKind" TEXT NOT NULL,
  "sourceListingId" TEXT,
  "sourceVehicleId" TEXT,
  "metaAudienceId" TEXT NOT NULL,
  "metaAdAccountId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "estimatedSize" INTEGER,
  "lastRefreshedAt" TIMESTAMP(3),
  "lastErrorAt" TIMESTAMP(3),
  "lastErrorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MetaCustomAudience_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MetaCustomAudience_dealer_kind_listing_vehicle_key"
  ON "MetaCustomAudience"("dealerId", "audienceKind", "sourceListingId", "sourceVehicleId");

CREATE INDEX IF NOT EXISTS "MetaCustomAudience_dealerId_idx"
  ON "MetaCustomAudience"("dealerId");

CREATE INDEX IF NOT EXISTS "MetaCustomAudience_metaAudienceId_idx"
  ON "MetaCustomAudience"("metaAudienceId");

DO $$ BEGIN
  ALTER TABLE "MetaCustomAudience"
    ADD CONSTRAINT "MetaCustomAudience_dealerId_fkey"
    FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- RLS: server-only table, app accesses via DATABASE_URL which bypasses RLS.
ALTER TABLE "MetaCustomAudience" ENABLE ROW LEVEL SECURITY;
