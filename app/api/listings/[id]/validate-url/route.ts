export const maxDuration = 300;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { checkSubscription } from "@/lib/checkSubscription";
import { firecrawlClient } from "@/lib/firecrawl";
import {
  SERVICES_EXTRACTION_SCHEMA,
  SERVICES_EXTRACTION_PROMPT,
} from "@/lib/extractionSchema";
import {
  scoreServiceUrlMatch,
  derivePublishStatus,
  checkServicesCompleteness,
  type ScrapedServiceData,
  type DraftServiceData,
} from "@/lib/serviceUrlValidator";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const dealerId = await getEffectiveDealerId();
  if (!dealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isSubscribed = await checkSubscription(dealerId);
  if (!isSubscribed) {
    return NextResponse.json({ error: "subscription_required" }, { status: 403 });
  }

  const { id } = await params;

  const listing = await prisma.listing.findFirst({
    where: { id, dealerId },
  });

  if (!listing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (listing.vertical !== "services") {
    return NextResponse.json(
      { error: "validation_only_supported_for_services" },
      { status: 400 }
    );
  }

  if (!listing.url) {
    return NextResponse.json({ error: "missing_url" }, { status: 400 });
  }

  try {
    const response = await firecrawlClient.scrape(listing.url, {
      formats: [
        {
          type: "json",
          prompt: SERVICES_EXTRACTION_PROMPT,
          schema: SERVICES_EXTRACTION_SCHEMA,
        },
      ],
    });

    const extractionPayload = (response as { json?: unknown })?.json;
    const rawData = (extractionPayload !== null && typeof extractionPayload === "object"
      ? extractionPayload
      : {}) as Record<string, unknown>;

    const scraped: ScrapedServiceData = {
      title: typeof rawData.title === "string" ? rawData.title : null,
      description: typeof rawData.description === "string" ? rawData.description : null,
      price:
        typeof rawData.price === "string" || typeof rawData.price === "number"
          ? (rawData.price as string | number)
          : null,
      booking_url: typeof rawData.booking_url === "string" ? rawData.booking_url : null,
      cta_text: typeof rawData.cta_text === "string" ? rawData.cta_text : null,
      category: typeof rawData.category === "string" ? rawData.category : null,
      brand: typeof rawData.brand === "string" ? rawData.brand : null,
    };

    const listingData = (listing.data ?? {}) as Record<string, unknown>;
    const draftCategory = typeof listingData.category === "string" ? listingData.category : null;
    const draftBrand = typeof listingData.brand === "string" ? listingData.brand : null;
    const draftPrice =
      listing.price != null
        ? listing.price
        : typeof listingData.price === "string" || typeof listingData.price === "number"
          ? (listingData.price as string | number)
          : null;

    const draft: DraftServiceData = {
      title: listing.title,
      category: draftCategory,
      price: draftPrice,
      brand: draftBrand,
    };

    const { score, verdict } = scoreServiceUrlMatch(scraped, draft);

    const listingDataForCheck = (listing.data ?? {}) as Record<string, unknown>;
    const { missingFields, isComplete } = checkServicesCompleteness(
      listingDataForCheck,
      listing.imageUrls,
      listing.title
    );

    const derivedStatus = derivePublishStatus(verdict, isComplete);
    // Preserve an existing `published` status when re-validation still yields a
    // non-downgrade result. `derivePublishStatus` never returns `published`, so
    // without this guard, re-running validation on a published listing would
    // silently drop it back to `ready_to_publish` / `validated` and remove it
    // from the feed export.
    const publishStatus =
      listing.publishStatus === "published" && derivedStatus === "ready_to_publish"
        ? "published"
        : derivedStatus;

    await prisma.listing.update({
      where: { id: listing.id },
      data: {
        urlValidationScore: score,
        publishStatus,
        isComplete,
        missingFields,
      },
    });

    return NextResponse.json({ score, verdict, publishStatus, isComplete });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error({
      event: "listing_validate_url_error",
      listingId: listing.id,
      url: listing.url,
      dealerId,
      message,
    });
    return NextResponse.json({ error: "validation_failed" }, { status: 500 });
  }
}
