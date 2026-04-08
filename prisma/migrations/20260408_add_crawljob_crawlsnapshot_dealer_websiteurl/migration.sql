-- AlterTable: Add websiteUrl column to Dealer
ALTER TABLE "Dealer" ADD COLUMN "websiteUrl" TEXT;

-- CreateTable: CrawlJob
CREATE TABLE "CrawlJob" (
    "id" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "urlsFound" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CrawlJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable: CrawlSnapshot
CREATE TABLE "CrawlSnapshot" (
    "id" TEXT NOT NULL,
    "crawlJobId" TEXT NOT NULL,
    "dealerId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "weeksActive" INTEGER NOT NULL DEFAULT 1,
    "addedToFeed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "CrawlSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrawlJob_dealerId_idx" ON "CrawlJob"("dealerId");

-- CreateIndex
CREATE UNIQUE INDEX "CrawlSnapshot_dealerId_url_key" ON "CrawlSnapshot"("dealerId", "url");
CREATE INDEX "CrawlSnapshot_dealerId_idx" ON "CrawlSnapshot"("dealerId");
CREATE INDEX "CrawlSnapshot_crawlJobId_idx" ON "CrawlSnapshot"("crawlJobId");

-- AddForeignKey
ALTER TABLE "CrawlJob" ADD CONSTRAINT "CrawlJob_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrawlSnapshot" ADD CONSTRAINT "CrawlSnapshot_crawlJobId_fkey" FOREIGN KEY ("crawlJobId") REFERENCES "CrawlJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CrawlSnapshot" ADD CONSTRAINT "CrawlSnapshot_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
