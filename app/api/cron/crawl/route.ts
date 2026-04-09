import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { firecrawlClient } from "@/lib/firecrawl";
import { normalizeUrl } from "@/app/api/crawl/route";
import { checkSubscription } from "@/lib/checkSubscription";

const MONTHLY_CRAWL_LIMIT = 4;

const INVENTORY_PATTERNS = [
  /\/inventory\//i,
  /\/vehicles?\//i,
  /\/used\//i,
  /\/new\//i,
  /\/products?\//i,
  /\/shop\//i,
  /\/listing\//i,
  /\/cars?\//i,
  /\/trucks?\//i,
  /\/suvs?\//i,
  /\/vdp\//i,
  /\/detail\//i,
  /\/vehicle-details\//i,
  /\/certified\//i,
];

const EXCLUDE_PATTERNS = [
  /\/about/i, /\/contact/i, /\/blog/i, /\/careers/i, /\/privacy/i,
  /\/terms/i, /\/faq/i, /\/login/i, /\/signup/i, /\/account/i,
  /\/cart/i, /\/checkout/i, /\/sitemap/i, /\/feed/i, /\/rss/i,
  /\.pdf$/i, /\.xml$/i, /\.jpg$/i, /\.png$/i,
];

const INVENTORY_SUBPATHS = ["/inventory", "/new-inventory", "/used-inventory"];

function isInventoryUrl(url: string): boolean {
  if (EXCLUDE_PATTERNS.some((p) => p.test(url))) return false;
  return INVENTORY_PATTERNS.some((p) => p.test(url));
}

/**
 * GET /api/cron/crawl — Weekly auto-crawl cron job
 * Protected by CRON_SECRET. Finds all dealers with autoCrawlEnabled=true,
 * websiteUrl set, and remaining monthly quota, then triggers a crawl for each.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const dealers = await prisma.dealer.findMany({
    where: {
      autoCrawlEnabled: true,
      websiteUrl: { not: null },
      vertical: { in: ["automotive", "ecommerce"] },
    },
    select: { id: true, websiteUrl: true },
  });

  let triggered = 0;
  let skipped = 0;

  for (const dealer of dealers) {
    if (!dealer.websiteUrl) { skipped++; continue; }

    // Subscription gating — skip dealers without an active subscription
    const isSubscribed = await checkSubscription(dealer.id);
    if (!isSubscribed) {
      skipped++;
      continue;
    }

    // Check monthly quota (early check before transaction)
    const crawlsThisMonth = await prisma.crawlJob.count({
      where: {
        dealerId: dealer.id,
        startedAt: { gte: monthStart },
        status: { not: "failed" },
      },
    });

    if (crawlsThisMonth >= MONTHLY_CRAWL_LIMIT) {
      skipped++;
      continue;
    }

    // Create crawl job inside a Serializable transaction to prevent races with manual crawls
    let crawlJob: { id: string };
    try {
      crawlJob = await prisma.$transaction(
        async (tx) => {
          const txCount = await tx.crawlJob.count({
            where: {
              dealerId: dealer.id,
              startedAt: { gte: monthStart },
              status: { not: "failed" },
            },
          });
          if (txCount >= MONTHLY_CRAWL_LIMIT) {
            throw new Error("quota_exceeded");
          }
          return tx.crawlJob.create({
            data: { dealerId: dealer.id, status: "running" },
          });
        },
        { isolationLevel: "Serializable" }
      );
    } catch (err) {
      if (err instanceof Error && err.message === "quota_exceeded") {
        skipped++;
        continue;
      }
      throw err;
    }

    try {
      const parsedUrl = new URL(dealer.websiteUrl);
      const origin = parsedUrl.origin;
      const crawlTargets = [
        origin,
        ...INVENTORY_SUBPATHS.map((path) => `${origin}${path}`),
      ];
      const uniqueTargets = [...new Set(crawlTargets)];

      const mapResults = await Promise.allSettled(
        uniqueTargets.map((target) =>
          firecrawlClient.map(target, { limit: 5000 })
        )
      );

      const fulfilledCount = mapResults.filter((r) => r.status === "fulfilled").length;
      if (fulfilledCount === 0) {
        throw new Error("All map targets failed");
      }

      const allUrls: string[] = [];
      for (const result of mapResults) {
        if (result.status === "fulfilled") {
          const links = result.value.links ?? [];
          for (const link of links) {
            allUrls.push((link as { url: string }).url);
          }
        }
      }

      const normalizedUrls = allUrls.map(normalizeUrl);
      const inventoryUrls = [...new Set(normalizedUrls.filter(isInventoryUrl))];

      const crawlTime = new Date();
      for (const url of inventoryUrls) {
        await prisma.crawlSnapshot.upsert({
          where: { dealerId_url: { dealerId: dealer.id, url } },
          create: {
            crawlJobId: crawlJob.id,
            dealerId: dealer.id,
            url,
            firstSeenAt: crawlTime,
            lastSeenAt: crawlTime,
            weeksActive: 1,
          },
          update: {
            crawlJobId: crawlJob.id,
            lastSeenAt: crawlTime,
            weeksActive: { increment: 1 },
          },
        });
      }

      await prisma.crawlJob.update({
        where: { id: crawlJob.id },
        data: {
          status: "complete",
          completedAt: new Date(),
          urlsFound: inventoryUrls.length,
        },
      });

      triggered++;
    } catch (err) {
      await prisma.crawlJob.update({
        where: { id: crawlJob.id },
        data: { status: "failed", completedAt: new Date() },
      });
      console.error({
        event: "auto_crawl_error",
        dealerId: dealer.id,
        crawlJobId: crawlJob.id,
        message: err instanceof Error ? err.message : String(err),
      });
      skipped++;
    }
  }

  return NextResponse.json({ triggered, skipped });
}
