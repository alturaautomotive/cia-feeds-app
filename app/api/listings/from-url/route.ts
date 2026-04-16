import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkSubscription } from "@/lib/checkSubscription";
import { rateLimit } from "@/lib/rateLimit";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { firecrawlClient } from "@/lib/firecrawl";
import {
  ECOMMERCE_EXTRACTION_SCHEMA,
  SERVICES_EXTRACTION_SCHEMA,
  SERVICES_EXTRACTION_PROMPT,
} from "@/lib/extractionSchema";
import {
  canonicalizeUrl,
  isDuplicateCanonicalUrl,
  applyServicesFallbacks,
  buildFieldSources,
  checkServicesCompleteness,
} from "@/lib/serviceUrlValidator";
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
    select: { vertical: true, name: true, address: true },
  });

  if (!dealer || (dealer.vertical !== "ecommerce" && dealer.vertical !== "services")) {
    return NextResponse.json(
      { error: "URL scraping is only available for the E-commerce and Services verticals" },
      { status: 400 }
    );
  }

  const vertical = dealer.vertical;

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

  // Canonicalize + dedupe for services vertical
  let canonicalUrl: string | null = null;
  if (vertical === "services") {
    try {
      canonicalUrl = canonicalizeUrl(url);
    } catch {
      return NextResponse.json({ error: "invalid_url" }, { status: 400 });
    }
    const isDuplicate = await isDuplicateCanonicalUrl(dealerId, canonicalUrl);
    if (isDuplicate) {
      return NextResponse.json({ error: "duplicate_canonical_url" }, { status: 409 });
    }
  }

  // Create a stub listing row with pending status in data
  const listing = await prisma.listing.create({
    data: {
      dealerId,
      vertical,
      title: url,
      url,
      isComplete: false,
      missingFields: [],
      data: { scrapeStatus: "pending", url },
      ...(vertical === "services"
        ? { publishStatus: "draft", canonicalUrl }
        : {}),
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
      body: JSON.stringify({
        listingId: listing.id,
        url,
        dealerId,
        vertical,
        dealerName: dealer.name,
        dealerAddress: dealer.address,
      }),
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
      const schema = vertical === "services" ? SERVICES_EXTRACTION_SCHEMA : ECOMMERCE_EXTRACTION_SCHEMA;
      const prompt = vertical === "services" ? SERVICES_EXTRACTION_PROMPT : EXTRACTION_PROMPT;
      const response = await firecrawlClient.scrape(url, {
        formats: [{ type: "json", prompt, schema }],
      });

      const extractionPayload = (response as { json?: unknown })?.json;
      const rawData = (extractionPayload !== null && typeof extractionPayload === "object"
        ? extractionPayload
        : {}) as Record<string, unknown>;

      const title = typeof rawData.title === "string" && rawData.title
        ? rawData.title
        : url;

      let price: number | null = null;
      const priceRaw = rawData.price;
      if (priceRaw != null) {
        if (vertical === "services") {
          const numericOnly = String(priceRaw).trim().replace(/^\$/, "").replace(/,/g, "");
          if (/^\d+(\.\d+)?$/.test(numericOnly)) {
            price = parseFloat(numericOnly);
          }
        } else {
          const parsed = parseFloat(String(priceRaw).replace(/[^0-9.]/g, ""));
          price = Number.isFinite(parsed) ? parsed : null;
        }
      }

      const imageUrls: string[] = [];
      if (vertical === "services") {
        if (Array.isArray(rawData.images)) {
          for (const img of rawData.images) {
            if (typeof img === "string" && img.trim().length > 0) {
              imageUrls.push(img);
            }
          }
        }
      } else {
        if (typeof rawData.image_url === "string" && rawData.image_url) {
          imageUrls.push(rawData.image_url);
        }
        if (typeof rawData.image_url_2 === "string" && rawData.image_url_2) {
          imageUrls.push(rawData.image_url_2);
        }
      }

      const data: Record<string, unknown> = {
        ...rawData,
        scrapeStatus: "complete",
        url,
      };

      let isComplete: boolean;
      let missingFields: string[];

      if (vertical === "services") {
        // Mirror `name` into `data` so completeness/fallback logic can read it.
        if (!data.name && typeof rawData.title === "string") {
          data.name = rawData.title;
        }
        const { fallbackKeys } = applyServicesFallbacks(data, {
          name: dealer.name,
          address: dealer.address,
        });
        const fieldSources = buildFieldSources(data, fallbackKeys);
        data.fieldSources = fieldSources;
        const completeness = checkServicesCompleteness(data, imageUrls, title);
        isComplete = completeness.isComplete;
        missingFields = completeness.missingFields;
      } else {
        const requiredFields = getRequiredFields(vertical);
        missingFields = requiredFields.filter((f) => {
          if (f === "image_url") return false;
          if (f === "title" || f === "name") {
            return !title || title.trim() === "";
          }
          const val = data[f];
          return val === undefined || val === null || val === "";
        });
        if (requiredFields.includes("image_url") && imageUrls.length === 0) {
          missingFields.push("image_url");
        }
        isComplete = missingFields.length === 0;
      }

      await prisma.listing.update({
        where: { id: listing.id },
        data: {
          title,
          price: price != null && Number.isFinite(price) ? price : null,
          imageUrls,
          url,
          isComplete,
          missingFields,
          data: data as Prisma.InputJsonValue,
          ...(vertical === "services"
            ? { publishStatus: "draft", canonicalUrl }
            : {}),
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
