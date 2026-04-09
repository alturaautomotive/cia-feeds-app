import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkSubscription } from "@/lib/checkSubscription";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { firecrawlClient } from "@/lib/firecrawl";

const ALLOWED_CRAWL_VERTICALS = ["automotive", "ecommerce"];
const MONTHLY_CRAWL_LIMIT = 4;

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
  /\/vdp\//i,
  /\/detail\//i,
  /\/vehicle-details\//i,
  /\/certified\//i,
];

/** Sub-paths to crawl in parallel for better inventory coverage */
const INVENTORY_SUBPATHS = [
  "/inventory",
  "/new-inventory",
  "/used-inventory",
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

/** Normalize a URL for deduplication: force https, strip trailing slashes, query params, fragments */
export function normalizeUrl(raw: string): string {
  try {
    const parsed = new URL(raw);
    parsed.protocol = "https:";
    parsed.search = "";
    parsed.hash = "";
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    parsed.pathname = pathname.toLowerCase();
    return parsed.toString();
  } catch {
    return raw;
  }
}

const METADATA_BATCH_SIZE = 5;
const METADATA_BATCH_DELAY_MS = 500;

/** Parse make/model/year from a title string or URL slug */
function parseVehicleInfo(text: string): {
  make: string | null;
  model: string | null;
  year: number | null;
} {
  const normalized = text.replace(/[-_]/g, " ");
  const yearFirst = normalized.match(/\b(19\d{2}|20[0-3]\d)\b\s+(\w+)\s+(\w+)/i);
  if (yearFirst) {
    return {
      year: parseInt(yearFirst[1], 10),
      make: yearFirst[2],
      model: yearFirst[3],
    };
  }
  const yearLast = normalized.match(/\b(\w+)\s+(\w+)\s+(19\d{2}|20[0-3]\d)\b/i);
  if (yearLast) {
    return {
      year: parseInt(yearLast[3], 10),
      make: yearLast[1],
      model: yearLast[2],
    };
  }
  return { make: null, model: null, year: null };
}

function parsePrice(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
}

/** JSON Schema for Firecrawl structured extraction */
const VEHICLE_EXTRACT_SCHEMA = {
  type: "object" as const,
  properties: {
    title: { type: "string", description: "The vehicle listing title or page title" },
    price: { type: "string", description: "The listed price of the vehicle (e.g. '$29,995' or '29995')" },
    make: { type: "string", description: "Vehicle manufacturer/make (e.g. Toyota, Ford, Honda)" },
    model: { type: "string", description: "Vehicle model name (e.g. Camry, F-150, Civic)" },
    year: { type: "number", description: "Vehicle model year (e.g. 2023)" },
    imageUrl: { type: "string", description: "URL of the primary vehicle image or thumbnail" },
  },
};

/** Fetch metadata for a single URL using Firecrawl structured extraction with OG fallback (non-fatal) */
async function fetchUrlMetadata(url: string): Promise<{
  title: string | null;
  thumbnailUrl: string | null;
  price: number | null;
  make: string | null;
  model: string | null;
  year: number | null;
}> {
  const empty = { title: null, thumbnailUrl: null, price: null, make: null, model: null, year: null };
  try {
    const result = await firecrawlClient.scrape(url, {
      formats: [
        {
          type: "json",
          prompt: "Extract vehicle listing details including title, image URL, price, make, model, and year from this page. Look in structured data (JSON-LD, microdata), page content, and meta tags.",
          schema: VEHICLE_EXTRACT_SCHEMA,
        },
      ],
    });

    const extracted = result.json as {
      title?: string;
      price?: string | number;
      make?: string;
      model?: string;
      year?: number;
      imageUrl?: string;
    } | undefined;

    const meta = result.metadata;

    const extractedTitle = extracted?.title || null;
    const extractedImage = extracted?.imageUrl || null;
    const extractedPrice = extracted?.price != null ? parsePrice(String(extracted.price)) : null;
    const extractedMake = extracted?.make || null;
    const extractedModel = extracted?.model || null;
    const extractedYear = extracted?.year != null && !isNaN(extracted.year) ? extracted.year : null;

    const ogTitle = meta?.ogTitle || meta?.title || null;
    const ogImage = meta?.ogImage || null;
    const metaRecord = meta as Record<string, string> | undefined;
    const ogPrice = metaRecord?.["og:price:amount"] ?? null;

    const title = extractedTitle || ogTitle;
    const thumbnailUrl = extractedImage || ogImage;
    const price = extractedPrice ?? parsePrice(ogPrice);
    const make = extractedMake;
    const model = extractedModel;
    const year = extractedYear;

    if (!make && !model && !year) {
      const parsed = parseVehicleInfo(title || url);
      return { title, thumbnailUrl, price, make: parsed.make, model: parsed.model, year: parsed.year };
    }

    return { title, thumbnailUrl, price, make, model, year };
  } catch (err) {
    console.error({
      event: "metadata_fetch_error",
      url,
      message: err instanceof Error ? err.message : String(err),
    });
    return empty;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Enrich snapshot metadata by scraping each URL in batches. */
async function enrichMetadataInBackground(
  urls: string[],
  dealerId: string
): Promise<void> {
  for (let i = 0; i < urls.length; i += METADATA_BATCH_SIZE) {
    const batch = urls.slice(i, i + METADATA_BATCH_SIZE);
    const metadataResults = await Promise.all(
      batch.map((url) => fetchUrlMetadata(url))
    );
    for (let j = 0; j < batch.length; j++) {
      const meta = metadataResults[j];
      const hasData =
        meta.title || meta.thumbnailUrl || meta.price || meta.make || meta.model || meta.year;
      if (hasData) {
        try {
          await prisma.crawlSnapshot.update({
            where: { dealerId_url: { dealerId, url: batch[j] } },
            data: {
              title: meta.title,
              thumbnailUrl: meta.thumbnailUrl,
              price: meta.price,
              make: meta.make,
              model: meta.model,
              year: meta.year,
            },
          });
        } catch (err) {
          console.error({
            event: "metadata_write_error",
            url: batch[j],
            dealerId,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }
    if (i + METADATA_BATCH_SIZE < urls.length) {
      await sleep(METADATA_BATCH_DELAY_MS);
    }
  }
}

/** Get the start of the current calendar month (UTC) */
function getStartOfMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Get the start of next month for display (UTC) */
function getStartOfNextMonth(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

class QuotaError extends Error {
  used: number;
  constructor(used: number) {
    super("monthly_limit_reached");
    this.used = used;
  }
}

/**
 * POST /api/crawl — Trigger a website crawl for the dealer
 */
export async function POST(request: NextRequest) {
  // Suppress unused-var — request is required by Next.js route signature
  void request;

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

  // Always use the dealer's profile websiteUrl — no custom URL input
  const websiteUrl = dealer.websiteUrl;
  if (!websiteUrl || !isValidUrl(websiteUrl)) {
    return NextResponse.json({ error: "no_website_url" }, { status: 400 });
  }

  // Monthly quota check: 4 crawls per calendar month
  const monthStart = getStartOfMonth();
  const crawlsThisMonth = await prisma.crawlJob.count({
    where: {
      dealerId,
      startedAt: { gte: monthStart },
      status: { not: "failed" },
    },
  });

  if (crawlsThisMonth >= MONTHLY_CRAWL_LIMIT) {
    return NextResponse.json(
      {
        error: "monthly_limit_reached",
        used: crawlsThisMonth,
        limit: MONTHLY_CRAWL_LIMIT,
        resetsAt: getStartOfNextMonth().toISOString(),
      },
      { status: 429 }
    );
  }

  // Create crawl job inside a transaction to prevent races
  let crawlJob: { id: string };
  try {
    crawlJob = await prisma.$transaction(
      async (tx) => {
        const txCount = await tx.crawlJob.count({
          where: {
            dealerId,
            startedAt: { gte: monthStart },
            status: { not: "failed" },
          },
        });
        if (txCount >= MONTHLY_CRAWL_LIMIT) {
          throw new QuotaError(txCount);
        }
        return tx.crawlJob.create({
          data: { dealerId, status: "running" },
        });
      },
      { isolationLevel: "Serializable" }
    );
  } catch (err) {
    if (err instanceof QuotaError) {
      return NextResponse.json(
        {
          error: "monthly_limit_reached",
          used: err.used,
          limit: MONTHLY_CRAWL_LIMIT,
          resetsAt: getStartOfNextMonth().toISOString(),
        },
        { status: 429 }
      );
    }
    throw err;
  }

  try {
    const parsedUrl = new URL(websiteUrl);
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

    for (let i = 0; i < mapResults.length; i++) {
      const result = mapResults[i];
      if (result.status === "rejected") {
        console.error({
          event: "map_target_failed",
          crawlJobId: crawlJob.id,
          target: uniqueTargets[i],
          message: result.reason instanceof Error ? result.reason.message : String(result.reason),
        });
      }
    }

    const fulfilledCount = mapResults.filter((r) => r.status === "fulfilled").length;
    if (fulfilledCount === 0) {
      throw new Error("All Firecrawl map targets failed — no URLs discovered");
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

    // Normalize URLs for deduplication, then filter for inventory pages
    const normalizedUrls = allUrls.map(normalizeUrl);
    const inventoryUrls = [...new Set(normalizedUrls.filter(isInventoryUrl))];

    const now = new Date();
    for (const url of inventoryUrls) {
      await prisma.crawlSnapshot.upsert({
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
    }

    try {
      await enrichMetadataInBackground(inventoryUrls, dealerId);
    } catch (err) {
      console.error({
        event: "metadata_enrichment_error",
        crawlJobId: crawlJob.id,
        message: err instanceof Error ? err.message : String(err),
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

    const allSnapshotsRaw = await prisma.crawlSnapshot.findMany({
      where: { dealerId },
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        url: true,
        firstSeenAt: true,
        lastSeenAt: true,
        weeksActive: true,
        addedToFeed: true,
        make: true,
        model: true,
        year: true,
        price: true,
        title: true,
        thumbnailUrl: true,
      },
    });

    // Deduplicate by normalized URL, keeping the newest row (by lastSeenAt)
    const seenUrls = new Map<string, (typeof allSnapshotsRaw)[number]>();
    for (const snap of allSnapshotsRaw) {
      const key = normalizeUrl(snap.url);
      if (!seenUrls.has(key)) {
        seenUrls.set(key, snap);
      }
    }
    const allSnapshots = [...seenUrls.values()];

    return NextResponse.json({
      crawlJobId: crawlJob.id,
      urlsFound: inventoryUrls.length,
      snapshots: allSnapshots,
      quota: {
        used: crawlsThisMonth + 1,
        limit: MONTHLY_CRAWL_LIMIT,
        resetsAt: getStartOfNextMonth().toISOString(),
      },
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
 * GET /api/crawl — Returns the dealer's last 10 crawl jobs + monthly quota info
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

  const monthStart = getStartOfMonth();
  const crawlsThisMonth = await prisma.crawlJob.count({
    where: {
      dealerId,
      startedAt: { gte: monthStart },
      status: { not: "failed" },
    },
  });

  return NextResponse.json({
    jobs,
    quota: {
      used: crawlsThisMonth,
      limit: MONTHLY_CRAWL_LIMIT,
      resetsAt: getStartOfNextMonth().toISOString(),
    },
  });
}
