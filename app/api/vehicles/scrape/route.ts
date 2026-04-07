export const maxDuration = 300;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { scrapeVehicleUrl } from "@/lib/scrape";
import { logScrapeStart, logScrapeEnd } from "@/lib/logger";

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

  const { vehicleId, url, dealerId } = body as Record<string, unknown>;

  if (
    !vehicleId || typeof vehicleId !== "string" ||
    !url || typeof url !== "string" ||
    !dealerId || typeof dealerId !== "string"
  ) {
    return NextResponse.json({ error: "missing_fields" }, { status: 400 });
  }

  logScrapeStart({ dealerId, url, timestamp: new Date().toISOString() });

  try {
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
      return NextResponse.json({ ok: false }, { status: 200 });
    }

    const { vehicle: scraped, fieldsExtracted } = scrapeResult;
    const firecrawlDurationMs = Date.now() - firecrawlStartMs;

    // VIN dedup
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

    // DB update with all scraped fields
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

    logScrapeEnd({
      dealerId,
      url,
      durationMs: firecrawlDurationMs,
      fieldsExtracted,
      missingFields: scraped.missingFields,
    });

    return NextResponse.json({ ok: true });
  } catch (outerErr) {
    const message = outerErr instanceof Error ? outerErr.message : String(outerErr);
    console.error({ event: "background_job_error", vehicleId, url, dealerId, message });

    try {
      await prisma.vehicle.update({
        where: { id: vehicleId },
        data: { scrapeStatus: "failed" },
      });
    } catch (fallbackErr) {
      console.error({ event: "fallback_status_update_error", vehicleId, message: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr) });
    }

    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
