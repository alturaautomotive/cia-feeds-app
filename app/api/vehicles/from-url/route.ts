import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scrapeVehicleUrl } from "@/lib/scrape";
import { logScrapeStart, logScrapeEnd } from "@/lib/logger";
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

  // Phase 2: run Firecrawl in the background after response is sent
  after(async () => {
    try {
      logScrapeStart({ dealerId, url, timestamp: new Date().toISOString() });
      const firecrawlStartMs = Date.now();

      let scrapeResult: Awaited<ReturnType<typeof scrapeVehicleUrl>>;
      try {
        scrapeResult = await scrapeVehicleUrl(url, dealerId);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error({ event: "scrape_error", url, message });
        await prisma.vehicle.update({
          where: { id: vehicleId },
          data: { scrapeStatus: "failed" },
        });
        return;
      }

      const { vehicle: scraped, fieldsExtracted } = scrapeResult;
      const firecrawlDurationMs = Date.now() - firecrawlStartMs;

      logScrapeEnd({
        dealerId,
        url,
        durationMs: firecrawlDurationMs,
        fieldsExtracted,
        missingFields: scraped.missingFields,
      });

      // Check for existing vehicle by VIN (idempotency merge).
      // Always update vehicleId (the returned ID) to preserve id stability.
      // Delete the duplicate VIN-matched row if one exists.
      if (scraped.vin) {
        const byVin = await prisma.vehicle.findFirst({
          where: { dealerId, vin: scraped.vin, NOT: { id: vehicleId } },
          select: { id: true },
        });
        if (byVin) {
          try {
            await prisma.vehicle.delete({ where: { id: byVin.id } });
          } catch (dedupErr) {
            console.error({ event: "vin_dedup_delete_error", byVinId: byVin.id, message: dedupErr instanceof Error ? dedupErr.message : String(dedupErr) });
          }
        }
      }

      await prisma.vehicle.update({
        where: { id: vehicleId },
        data: {
          vin: scraped.vin,
          make: scraped.make,
          model: scraped.model,
          year: scraped.year,
          bodyStyle: scraped.bodyStyle,
          price: scraped.price,
          mileageValue: scraped.mileageValue,
          stateOfVehicle: scraped.stateOfVehicle,
          exteriorColor: scraped.exteriorColor,
          imageUrl: scraped.imageUrl,
          description: scraped.description,
          isComplete: scraped.isComplete,
          missingFields: scraped.missingFields,
          scrapeStatus: "complete",
        },
      });
    } catch (err) {
      console.error({ event: "background_job_error", vehicleId, url, message: err instanceof Error ? err.message : String(err) });
      try {
        await prisma.vehicle.update({
          where: { id: vehicleId },
          data: { scrapeStatus: "failed" },
        });
      } catch (fallbackErr) {
        console.error({ event: "background_job_fallback_error", vehicleId, message: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr) });
      }
    }
  });

  return NextResponse.json({ vehicle: { id: vehicleId, scrapeStatus: "pending", url } }, { status: 202 });
}
