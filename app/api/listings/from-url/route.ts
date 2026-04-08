import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkSubscription } from "@/lib/checkSubscription";
import { rateLimit } from "@/lib/rateLimit";
import { getEffectiveDealerId } from "@/lib/impersonation";

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

  // Fire-and-forget: dispatch scraping to dedicated route
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  fetch(`${appUrl}/api/listings/scrape`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sync-secret": process.env.SYNC_SECRET ?? "",
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

  return NextResponse.json(
    { listing: { id: listing.id, scrapeStatus: "pending", url } },
    { status: 202 }
  );
}
