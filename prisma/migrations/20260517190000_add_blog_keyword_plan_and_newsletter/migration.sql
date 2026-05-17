CREATE TABLE IF NOT EXISTS "KeywordPlan" (
  "id" TEXT NOT NULL,
  "keyword" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'en',
  "angle" TEXT,
  "landingSlug" TEXT,
  "publishedAt" TIMESTAMP(3),
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KeywordPlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "KeywordPlan_publishedAt_priority_createdAt_idx" ON "KeywordPlan"("publishedAt", "priority", "createdAt");

CREATE TABLE IF NOT EXISTS "BlogPost" (
  "id" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "locale" TEXT NOT NULL DEFAULT 'en',
  "keywordPlanId" TEXT,
  "title" TEXT NOT NULL,
  "metaDescription" TEXT NOT NULL,
  "excerpt" TEXT NOT NULL,
  "bodyMarkdown" TEXT NOT NULL,
  "heroImageUrl" TEXT,
  "mediumPostId" TEXT,
  "mediumUrl" TEXT,
  "landingSlug" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "publishedAt" TIMESTAMP(3),
  "generatedBy" TEXT NOT NULL DEFAULT 'cron:biweekly-content',
  "views" INTEGER NOT NULL DEFAULT 0,
  "emailsSent" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BlogPost_slug_key" ON "BlogPost"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "BlogPost_keywordPlanId_key" ON "BlogPost"("keywordPlanId");
CREATE INDEX IF NOT EXISTS "BlogPost_status_publishedAt_idx" ON "BlogPost"("status", "publishedAt");
CREATE INDEX IF NOT EXISTS "BlogPost_locale_status_idx" ON "BlogPost"("locale", "status");
ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_keywordPlanId_fkey" FOREIGN KEY ("keywordPlanId") REFERENCES "KeywordPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "NewsletterSubscriber" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "emailHash" TEXT NOT NULL,
  "name" TEXT,
  "phone" TEXT,
  "source" TEXT NOT NULL,
  "interest" TEXT,
  "locale" TEXT NOT NULL DEFAULT 'en',
  "unsubscribedAt" TIMESTAMP(3),
  "unsubscribeToken" TEXT NOT NULL,
  "lastEmailedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NewsletterSubscriber_emailHash_key" ON "NewsletterSubscriber"("emailHash");
CREATE UNIQUE INDEX IF NOT EXISTS "NewsletterSubscriber_unsubscribeToken_key" ON "NewsletterSubscriber"("unsubscribeToken");
CREATE INDEX IF NOT EXISTS "NewsletterSubscriber_source_unsubscribedAt_idx" ON "NewsletterSubscriber"("source", "unsubscribedAt");
CREATE INDEX IF NOT EXISTS "NewsletterSubscriber_interest_unsubscribedAt_idx" ON "NewsletterSubscriber"("interest", "unsubscribedAt");
