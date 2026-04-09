import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkSubscription } from "@/lib/checkSubscription";
import { rateLimit } from "@/lib/rateLimit";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { firecrawlClient } from "@/lib/firecrawl";
import { ECOMMERCE_EXTRACTION_SCHEMA } from "@/lib/extractionSchema";
import { getRequiredFields } from "@/lib/verticals";
import type { Prisma } from "@prisma/client";

const EXTRACTION_PROMPT = `
Extract the following product information from this e-commerce product page:
- title: the product title/name
- description: a brief product description
- price: the listed price as a string (e.g., "$29.99")
- brand: the brand or manufacturer name
- condition: one of "new", "used", or "refurbished"
- availability: one of "in stock" or "out of stock"
- retailer_id: the SKU, item number, or retailer product ID
- image_url: URL of the main product image
- image_url_2: URL of the second product image (if available)
- google_product_category: the product category (if available)

Return null for any field you cannot find.
`;

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

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

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { vertical: true },
  });

  if (!dealer || dealer.vertical !== "ecommerce") {
    return NextResponse.json(
      { error: "URL scraping is only available for the E-commerce vertical" },
      { status: 400 }
    );
  }

  const rl = rateLimit(`scrape-listing:${dealerId}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", retryAfterMs: rl.retryAfterMs }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { url } = body as Record<string, unknown>;

  if (!url || typeof url !== "string" || !isValidUrl(url)) {
    return NextResponse.json({ error: "invalid_url" }, { status: 400 });
  }

  // Create a stub listing row with pending status in data
  const listing = await prisma.listing.create({
    data: {
      dealerId,
      vertical: "ecommerce",
      title: url,
      url,
      isComplete: false,
      missingFields: [],
      data: { scrapeStatus: "pending", url },
    },
  });

  // Dispatch scraping: use fire-and-forget if SYNC_SECRET is set, otherwise inline fallback
  if (process.env.SYNC_SECRET) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    fetch(`${appUrl}/api/listings/scrape`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-sync-secret": process.env.SYNC_SECRET,
      },
      body: JSON.stringify({ listingId: listing.id, url, dealerId }),
    }).catch((err) => {
      console.error({
        event: "listing_scrape_dispatch_error",
        listingId: listing.id,
        url,
        message: err instanceof Error ? err.message : String(err),
      });
    });
  } else {
    console.warn({ event: "sync_secret_missing", hint: "Falling back to inline listing scrape" });
    try {
      const response = await firecrawlClient.scrape(url, {
        formats: [{ type: "json", prompt: EXTRACTION_PROMPT, schema: ECOMMERCE_EXTRACTION_SCHEMA }],
      });

      const extractionPayload = (response as { json?: unknown })?.json;
      const rawData = (extractionPayload !== null && typeof extractionPayload === "object"
        ? extractionPayload
        : {}) as Record<string, unknown>;

      const title = typeof rawData.title === "string" && rawData.title
        ? rawData.title
        : url;

      const priceRaw = rawData.price;
      const price = priceRaw != null
        ? parseFloat(String(priceRaw).replace(/[^0-9.]/g, ""))
        : null;

      const imageUrls: string[] = [];
      if (typeof rawData.image_url === "string" && rawData.image_url) {
        imageUrls.push(rawData.image_url);
      }
      if (typeof rawData.image_url_2 === "string" && rawData.image_url_2) {
        imageUrls.push(rawData.image_url_2);
      }

      const data: Record<string, unknown> = {
        ...rawData,
        scrapeStatus: "complete",
        url,
      };

      const requiredFields = getRequiredFields("ecommerce");
      const missingFields = requiredFields.filter((f) => {
        const val = data[f];
        return val === undefined || val === null || val === "";
      });

      await prisma.listing.update({
        where: { id: listing.id },
        data: {
          title,
          price: price != null && Number.isFinite(price) ? price : null,
          imageUrls,
          url,
          isComplete: missingFields.length === 0,
          missingFields,
          data: data as Prisma.InputJsonValue,
        },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error({ event: "inline_listing_scrape_error", listingId: listing.id, url, dealerId, message });
      try {
        await prisma.listing.update({
          where: { id: listing.id },
          data: {
            data: { scrapeStatus: "failed", url, error: message } as Prisma.InputJsonValue,
          },
        });
      } catch (fallbackErr) {
        console.error({
          event: "inline_listing_scrape_fallback_error",
          listingId: listing.id,
          message: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
        });
      }
    }
  }

  // Mark CrawlSnapshot as added to feed (if it exists) — best-effort but awaited
  try {
    await prisma.crawlSnapshot.updateMany({
      where: { dealerId, url },
      data: { addedToFeed: true },
    });
  } catch (err: unknown) {
    console.error({
      event: "snapshot_mark_feed_error",
      dealerId,
      url,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json(
    { listing: { id: listing.id, scrapeStatus: "pending", url } },
    { status: 202 }
  );
}
