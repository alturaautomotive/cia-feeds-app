-- CreateTable
CREATE TABLE "MetaDeliveryJob" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "trigger" TEXT NOT NULL DEFAULT 'manual',
    "coalescedCount" INTEGER NOT NULL DEFAULT 0,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "consecutiveAuthFailures" INTEGER NOT NULL DEFAULT 0,
    "blockedAt" TIMESTAMP(3),
    "blockedReason" TEXT,
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" TEXT,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "lastItemsAttempted" INTEGER,
    "lastItemsSucceeded" INTEGER,
    "lastItemsFailed" INTEGER,
    "lastDeleteAttempted" INTEGER,
    "lastDeleteSucceeded" INTEGER,
    "lastDeleteFailed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetaDeliveryJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetaDeliveryJob_status_nextRunAt_idx" ON "MetaDeliveryJob"("status", "nextRunAt");

-- CreateIndex
CREATE INDEX "MetaDeliveryJob_dealerId_status_idx" ON "MetaDeliveryJob"("dealerId", "status");

-- AddForeignKey
ALTER TABLE "MetaDeliveryJob" ADD CONSTRAINT "MetaDeliveryJob_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Partial unique index: only one active job (queued/processing/retry) per dealer at a time
CREATE UNIQUE INDEX "MetaDeliveryJob_dealerId_active_unique"
  ON "MetaDeliveryJob" ("dealerId")
  WHERE "status" IN ('queued', 'processing', 'retry');
