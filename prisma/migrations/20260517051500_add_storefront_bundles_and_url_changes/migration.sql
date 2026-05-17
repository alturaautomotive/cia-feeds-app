CREATE TABLE IF NOT EXISTS "StorefrontBundle" (
  "id" TEXT NOT NULL,
  "dealerId" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StorefrontBundle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StorefrontBundle_dealerId_slug_key" ON "StorefrontBundle"("dealerId", "slug");
CREATE INDEX IF NOT EXISTS "StorefrontBundle_dealerId_idx" ON "StorefrontBundle"("dealerId");
ALTER TABLE "StorefrontBundle"
  ADD CONSTRAINT "StorefrontBundle_dealerId_fkey"
  FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubAccount" ADD COLUMN IF NOT EXISTS "bundleId" TEXT;
CREATE INDEX IF NOT EXISTS "SubAccount_bundleId_idx" ON "SubAccount"("bundleId");
ALTER TABLE "SubAccount"
  ADD CONSTRAINT "SubAccount_bundleId_fkey"
  FOREIGN KEY ("bundleId") REFERENCES "StorefrontBundle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "StorefrontUrlChange" (
  "id" TEXT NOT NULL,
  "dealerId" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "oldUrl" TEXT NOT NULL,
  "newUrl" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StorefrontUrlChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "StorefrontUrlChange_dealerId_createdAt_idx" ON "StorefrontUrlChange"("dealerId", "createdAt");
CREATE INDEX IF NOT EXISTS "StorefrontUrlChange_entityType_entityId_idx" ON "StorefrontUrlChange"("entityType", "entityId");
ALTER TABLE "StorefrontUrlChange"
  ADD CONSTRAINT "StorefrontUrlChange_dealerId_fkey"
  FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
