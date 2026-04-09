import { prisma } from "@/lib/prisma";
import { firecrawlClient } from "@/lib/firecrawl";

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

/** Normalize a URL: force https, strip trailing slashes, query params, and hash */
export function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.protocol = "https:";
    parsed.search = "";
    parsed.hash = "";
    let pathname = parsed.pathname;
    // Strip trailing slashes (but keep root "/")
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.replace(/\/+$/, "");
    }
    parsed.pathname = pathname;
    return parsed.toString();
  } catch {
    return url;
  }
}

const METADATA_BATCH_SIZE = 5;
const METADATA_BATCH_DELAY_MS = 500;

/** JSON Schema for Firecrawl structured extraction */
const VEHICLE_EXTRACT_SCHEMA = {
  type: "object" as const,
  properties: {
    title: {
      type: "string",
      description:
        "The vehicle listing title. Look in <h1>, og:title meta tag, or JSON-LD 'name' field.",
    },
    price: {
      type: "string",
      description:
        "The listed sale price of the vehicle (e.g. '$29,995' or '29995'). Search in order: JSON-LD offers.price, elements with class names containing 'price'/'sale-price'/'final-price'/'vehicle-price'/'msrp'/'internet-price'/'our-price', data-price or data-msrp attributes, og:price:amount meta tag. Exclude 'Call for price' or empty values.",
    },
    make: {
      type: "string",
      description:
        "Vehicle manufacturer/make (e.g. Toyota, Ford, Honda). Look in JSON-LD 'brand.name' or 'manufacturer', or breadcrumb navigation.",
    },
    model: {
      type: "string",
      description:
        "Vehicle model name (e.g. Camry, F-150, Civic). Look in JSON-LD 'model' field.",
    },
    year: {
      type: "number",
      description:
        "Vehicle model year as a 4-digit number between 1980 and 2030. Look in JSON-LD 'vehicleModelDate' or 'modelDate'.",
    },
    imageUrl: {
      type: "string",
      description:
        "Absolute http(s) URL of the primary vehicle image. Priority: JSON-LD 'image' → og:image or og:image:secure_url meta tag → twitter:image meta tag → first gallery <img> src. Must start with http:// or https://.",
    },
  },
};

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

/** Enrich snapshot metadata by scraping each URL in batches. */
async function enrichMetadataInBackground(
  urls: string[],
  dealerId: string,
  crawlJobId: string
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
    // Increment urlsEnriched after each batch
    await prisma.crawlJob.update({
      where: { id: crawlJobId },
      data: { urlsEnriched: { increment: batch.length } },
    });
    if (i + METADATA_BATCH_SIZE < urls.length) {
      await sleep(METADATA_BATCH_DELAY_MS);
    }
  }
  // Mark job as complete when all batches are done
  await prisma.crawlJob.update({
    where: { id: crawlJobId },
    data: { status: "complete", phase: "complete", completedAt: new Date() },
  });
}

/**
 * Core crawl logic shared by POST /api/crawl and the weekly cron.
 * Assumes the caller has already validated quota and created a CrawlJob record.
 */
export async function runCrawlForDealer(
  dealerId: string,
  websiteUrl: string,
  crawlJobId: string
): Promise<{ urlsFound: number }> {
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
        crawlJobId,
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

  // Normalize URLs before dedup to handle trailing-slash / http vs https / query-param noise
  const inventoryUrls = [...new Set(allUrls.map(normalizeUrl).filter(isInventoryUrl))];

  const now = new Date();
  for (const url of inventoryUrls) {
    await prisma.crawlSnapshot.upsert({
      where: { dealerId_url: { dealerId, url } },
      create: {
        crawlJobId,
        dealerId,
        url,
        firstSeenAt: now,
        lastSeenAt: now,
        weeksActive: 1,
      },
      update: {
        crawlJobId,
        lastSeenAt: now,
        weeksActive: { increment: 1 },
      },
    });
  }

  try {
    await enrichMetadataInBackground(inventoryUrls, dealerId, crawlJobId);
  } catch (err) {
    console.error({
      event: "metadata_enrichment_error",
      crawlJobId,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return { urlsFound: inventoryUrls.length };
}
