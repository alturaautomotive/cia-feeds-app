import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scrapeVehicleUrl } from "@/lib/scrape";
import { logScrapeStart, logScrapeEnd } from "@/lib/logger";

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

  logScrapeStart({ dealerId, url, timestamp: new Date().toISOString() });
  const firecrawlStartMs = Date.now();

  let scrapeResult: Awaited<ReturnType<typeof scrapeVehicleUrl>>;
  try {
    scrapeResult = await scrapeVehicleUrl(url, dealerId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error({ event: "scrape_error", url, message });
    return NextResponse.json(
      { error: "scrape_failed", message },
      { status: 502 }
    );
  }

  const { vehicle, fieldsExtracted } = scrapeResult;
  const firecrawlDurationMs = Date.now() - firecrawlStartMs;

  logScrapeEnd({ dealerId, url, durationMs: firecrawlDurationMs, fieldsExtracted, missingFields: vehicle.missingFields });

  // Check for existing vehicle by URL or VIN (idempotency)
  let existingId: string | null = null;

  const existing = await prisma.vehicle.findFirst({
    where: {
      dealerId,
      OR: [
        { url },
        ...(vehicle.vin ? [{ vin: vehicle.vin, dealerId }] : []),
      ],
    },
    select: { id: true },
  });

  if (existing) {
    existingId = existing.id;
  }

  const data = {
    url,
    vin: vehicle.vin,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    bodyStyle: vehicle.bodyStyle,
    price: vehicle.price,
    mileageValue: vehicle.mileageValue,
    stateOfVehicle: vehicle.stateOfVehicle,
    exteriorColor: vehicle.exteriorColor,
    imageUrl: vehicle.imageUrl,
    description: vehicle.description,
    isComplete: vehicle.isComplete,
    missingFields: vehicle.missingFields,
  };

  const saved = existingId
    ? await prisma.vehicle.update({ where: { id: existingId }, data })
    : await prisma.vehicle.create({ data: { ...data, dealerId } });

  return NextResponse.json(
    { vehicle: saved, missingFields: vehicle.missingFields },
    { status: existingId ? 200 : 201 }
  );
}
