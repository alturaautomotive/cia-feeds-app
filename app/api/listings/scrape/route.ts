export const maxDuration = 300;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { firecrawlClient } from "@/lib/firecrawl";
import {
  ECOMMERCE_EXTRACTION_SCHEMA,
  SERVICES_EXTRACTION_SCHEMA,
  SERVICES_EXTRACTION_PROMPT,
} from "@/lib/extractionSchema";
import { canonicalizeUrl } from "@/lib/serviceUrlValidator";
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

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-sync-secret");
  if (!secret || secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { listingId, url, dealerId, vertical: verticalRaw } = body as Record<string, unknown>;

  if (
    !listingId || typeof listingId !== "string" ||
    !url || typeof url !== "string" ||
    !dealerId || typeof dealerId !== "string"
  ) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  const vertical = typeof verticalRaw === "string" && verticalRaw.length > 0
    ? verticalRaw
    : "ecommerce";

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

    // Build data payload for CSV generation
    const data: Record<string, unknown> = {
      ...rawData,
      scrapeStatus: "complete",
      url,
    };

    const requiredFields = getRequiredFields(vertical);
    const missingFields = requiredFields.filter((f) => {
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

    let canonicalUrl: string | null = null;
    if (vertical === "services") {
      try {
        canonicalUrl = canonicalizeUrl(url);
      } catch {
        canonicalUrl = null;
      }
    }

    await prisma.listing.update({
      where: { id: listingId },
      data: {
        title,
        price: price != null && Number.isFinite(price) ? price : null,
        imageUrls,
        url,
        isComplete: missingFields.length === 0,
        missingFields,
        data: data as Prisma.InputJsonValue,
        ...(vertical === "services"
          ? { publishStatus: "draft", canonicalUrl }
          : {}),
      },
    });

    console.log({
      event: "listing_scrape_complete",
      listingId,
      url,
      dealerId,
      fieldsExtracted: Object.keys(rawData).filter((k) => rawData[k] != null),
      missingFields,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error({ event: "listing_scrape_error", listingId, url, dealerId, message });

    try {
      await prisma.listing.update({
        where: { id: listingId },
        data: {
          data: { scrapeStatus: "failed", url, error: message } as Prisma.InputJsonValue,
        },
      });
    } catch (fallbackErr) {
      console.error({
        event: "listing_scrape_fallback_error",
        listingId,
        message: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
      });
    }

    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
