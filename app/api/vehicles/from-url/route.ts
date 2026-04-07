import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkSubscription } from "@/lib/checkSubscription";
import { rateLimit } from "@/lib/rateLimit";

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

  const isSubscribed = await checkSubscription(session.user.id);
  if (!isSubscribed) {
    return NextResponse.json({ error: "subscription_required" }, { status: 403 });
  }

  const rl = rateLimit(`scrape:${session.user.id}`, 10, 60_000);
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

  const dealerId = session.user.id;

  // Phase 1: write a stub row immediately and respond 202
  const vehicle = await prisma.vehicle.upsert({
    where: { dealerId_url: { dealerId, url } },
    create: { url, dealerId, scrapeStatus: "pending", missingFields: [], isComplete: false },
    update: { scrapeStatus: "pending", missingFields: [], isComplete: false },
    select: { id: true },
  });

  const vehicleId = vehicle.id;

  // Fire-and-forget: dispatch scraping to dedicated long-running route
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    console.warn({ event: "scrape_dispatch_url_fallback", resolvedOrigin: appUrl, hint: "NEXT_PUBLIC_APP_URL is not set; falling back to request origin" });
  }
  fetch(`${appUrl}/api/vehicles/scrape`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-sync-secret": process.env.SYNC_SECRET ?? "",
    },
    body: JSON.stringify({ vehicleId, url, dealerId }),
  }).catch((err) => {
    console.error({
      event: "scrape_dispatch_error",
      vehicleId,
      url,
      message: err instanceof Error ? err.message : String(err),
    });
  });

  return NextResponse.json({ vehicle: { id: vehicleId, scrapeStatus: "pending", url } }, { status: 202 });
}
