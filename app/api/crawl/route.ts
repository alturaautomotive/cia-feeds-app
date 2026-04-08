import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkSubscription } from "@/lib/checkSubscription";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { firecrawlClient } from "@/lib/firecrawl";
import { rateLimit } from "@/lib/rateLimit";

class CooldownError extends Error {
  retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super("rate_limited");
    this.retryAfterMs = retryAfterMs;
  }
}

const ALLOWED_CRAWL_VERTICALS = ["automotive", "ecommerce"];
const CRAWL_COOLDOWN_MS = 3_600_000; // 1 hour

/** URL patterns that indicate inventory/listing pages */
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
];

/** URL patterns to exclude (non-listing pages) */
const EXCLUDE_PATTERNS = [
  /\/about/i,
  /\/contact/i,
  /\/blog/i,
  /\/careers/i,
  /\/privacy/i,
  /\/terms/i,
  /\/faq/i,
  /\/login/i,
  /\/signup/i,
  /\/account/i,
  /\/cart/i,
  /\/checkout/i,
  /\/sitemap/i,
  /\/feed/i,
  /\/rss/i,
  /\.pdf$/i,
  /\.xml$/i,
  /\.jpg$/i,
  /\.png$/i,
];

function isInventoryUrl(url: string): boolean {
  if (EXCLUDE_PATTERNS.some((p) => p.test(url))) return false;
  return INVENTORY_PATTERNS.some((p) => p.test(url));
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * POST /api/crawl — Trigger a website crawl for the dealer
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dealerId = await getEffectiveDealerId();
  if (!dealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isSubscribed = await checkSubscription(dealerId);
  if (!isSubscribed) {
    return NextResponse.json({ error: "subscription_required" }, { status: 403 });
  }

  // Vertical gating: only automotive and ecommerce dealers can crawl
  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { vertical: true, websiteUrl: true },
  });
  if (!dealer || !ALLOWED_CRAWL_VERTICALS.includes(dealer.vertical)) {
    return NextResponse.json(
      { error: "crawl_not_supported_for_vertical" },
      { status: 400 }
    );
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // Body may be empty when websiteUrl is omitted — that's valid
  }

  const providedUrl =
    typeof body.websiteUrl === "string" ? body.websiteUrl.trim() : null;
  const websiteUrl = providedUrl || dealer.websiteUrl;

  if (!websiteUrl || !isValidUrl(websiteUrl)) {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  // Rate-limit via shared utility (1 crawl per hour per dealer)
  const { allowed, retryAfterMs } = rateLimit(
    `crawl:${dealerId}`,
    1,
    CRAWL_COOLDOWN_MS
  );
  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs },
      { status: 429 }
    );
  }

  // Secondary DB safeguard against race conditions
  const cutoff = new Date(Date.now() - CRAWL_COOLDOWN_MS);
  let crawlJob: { id: string };
  try {
    crawlJob = await prisma.$transaction(
      async (tx) => {
        const recentCrawl = await tx.crawlJob.findFirst({
          where: {
            dealerId,
            startedAt: { gte: cutoff },
          },
          orderBy: { startedAt: "desc" },
          select: { startedAt: true },
        });
        if (recentCrawl) {
          const dbRetryAfterMs =
            CRAWL_COOLDOWN_MS - (Date.now() - recentCrawl.startedAt.getTime());
          throw new CooldownError(Math.max(0, dbRetryAfterMs));
        }

        // Only persist websiteUrl when explicitly provided
        if (providedUrl) {
          await tx.dealer.update({
            where: { id: dealerId },
            data: { websiteUrl: providedUrl },
          });
        }

        return tx.crawlJob.create({
          data: { dealerId, status: "running" },
        });
      },
      { isolationLevel: "Serializable" }
    );
  } catch (err) {
    if (err instanceof CooldownError) {
      return NextResponse.json(
        { error: "rate_limited", retryAfterMs: err.retryAfterMs },
        { status: 429 }
      );
    }
    throw err;
  }

  try {
    // Call Firecrawl map to discover all site URLs
    const mapResult = await firecrawlClient.map(websiteUrl, { limit: 500 });

    // Extract URLs from SearchResultWeb objects, filter, and deduplicate
    const allUrls = (mapResult.links ?? []).map((link: { url: string }) => link.url);
    const inventoryUrls = [...new Set(allUrls.filter(isInventoryUrl))];

    // Upsert snapshots — update existing, create new
    const now = new Date();
    const snapshots: Awaited<ReturnType<typeof prisma.crawlSnapshot.upsert>>[] = [];
    for (const url of inventoryUrls) {
      const snap = await prisma.crawlSnapshot.upsert({
        where: { dealerId_url: { dealerId, url } },
        create: {
          crawlJobId: crawlJob.id,
          dealerId,
          url,
          firstSeenAt: now,
          lastSeenAt: now,
          weeksActive: 1,
        },
        update: {
          crawlJobId: crawlJob.id,
          lastSeenAt: now,
          weeksActive: { increment: 1 },
        },
      });
      snapshots.push(snap);
    }

    // Mark crawl job complete
    await prisma.crawlJob.update({
      where: { id: crawlJob.id },
      data: {
        status: "complete",
        completedAt: now,
        urlsFound: inventoryUrls.length,
      },
    });

    // Return the full dealer snapshot set (including historical URLs not in this crawl)
    const allSnapshots = await prisma.crawlSnapshot.findMany({
      where: { dealerId },
      orderBy: { firstSeenAt: "desc" },
      select: {
        id: true,
        url: true,
        firstSeenAt: true,
        lastSeenAt: true,
        weeksActive: true,
        addedToFeed: true,
      },
    });

    return NextResponse.json({
      crawlJobId: crawlJob.id,
      urlsFound: inventoryUrls.length,
      snapshots: allSnapshots,
    });
  } catch (err) {
    await prisma.crawlJob.update({
      where: { id: crawlJob.id },
      data: { status: "failed", completedAt: new Date() },
    });
    console.error({
      event: "crawl_error",
      crawlJobId: crawlJob.id,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "crawl_failed" }, { status: 502 });
  }
}

/**
 * GET /api/crawl — Returns the dealer's last 10 crawl jobs
 */
export async function GET() {
  const dealerId = await getEffectiveDealerId();
  if (!dealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const jobs = await prisma.crawlJob.findMany({
    where: { dealerId },
    orderBy: { startedAt: "desc" },
    take: 10,
    select: {
      id: true,
      status: true,
      startedAt: true,
      completedAt: true,
      urlsFound: true,
    },
  });

  return NextResponse.json({ jobs });
}
