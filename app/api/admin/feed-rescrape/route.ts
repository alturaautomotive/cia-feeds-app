export const maxDuration = 300;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { Vertical } from "@prisma/client";
import { scrapeVehicleUrl } from "@/lib/scrape";
import { dispatchFeedDeliveryInBackground } from "@/lib/metaDelivery";
import { adminGuard } from "@/lib/auth";
import { durableRateLimit } from "@/lib/rateLimit";
import { adminFeedRescrapeBodySchema, adminFeedRescrapeQuerySchema } from "@/lib/requestSchemas";
import { writeAuditLog } from "@/lib/adminAudit";

const RESCRAPE_BATCH_SIZE = 5;
const RESCRAPE_BATCH_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rescrapeInBackground(
  vehicles: { id: string; url: string; dealerId: string }[]
): Promise<void> {
  const changedDealerIds = new Set<string>();

  for (let i = 0; i < vehicles.length; i += RESCRAPE_BATCH_SIZE) {
    const batch = vehicles.slice(i, i + RESCRAPE_BATCH_SIZE);
    await Promise.all(
      batch.map(async (vehicle) => {
        try {
          const scrapeResult = await scrapeVehicleUrl(vehicle.url, vehicle.dealerId);
          const { vehicle: scraped } = scrapeResult;

          await prisma.vehicle.update({
            where: { id: vehicle.id },
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
              ...(scraped.imageUrl ? { images: [scraped.imageUrl] } : {}),
              description: scraped.description,
              address: scraped.address,
              latitude: scraped.latitude,
              longitude: scraped.longitude,
              isComplete: scraped.isComplete,
              missingFields: scraped.missingFields,
              scrapeStatus: "complete",
            },
          });
          changedDealerIds.add(vehicle.dealerId);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error({
            event: "feed_rescrape_error",
            vehicleId: vehicle.id,
            url: vehicle.url,
            message,
          });
          try {
            await prisma.vehicle.update({
              where: { id: vehicle.id },
              data: { scrapeStatus: "failed" },
            });
          } catch {
            // best-effort status update
          }
        }
      })
    );
    if (i + RESCRAPE_BATCH_SIZE < vehicles.length) {
      await sleep(RESCRAPE_BATCH_DELAY_MS);
    }
  }

  const deliveryPromises: Promise<void>[] = [];
  const trackedExec = (cb: () => Promise<void>) => { deliveryPromises.push(cb()); };
  for (const dId of changedDealerIds) {
    dispatchFeedDeliveryInBackground(dId, "admin/feed-rescrape/POST", trackedExec);
  }
  await Promise.allSettled(deliveryPromises);
}

export async function POST(request: NextRequest) {
  // Rate limit
  const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  const rl = await durableRateLimit(`admin-feed-rescrape:${ip}`, 5, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "rate_limited", retryAfterMs: rl.retryAfterMs }, { status: 429 });
  }

  // Admin authorization
  const auth = await adminGuard("trigger_rescrape");
  if (!auth.ok) return auth.response!;

  // Validate body
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = adminFeedRescrapeBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const { dealerId, vertical } = parsed.data;
  const verticalFilter: Vertical = (vertical ?? "automotive") as Vertical;

  let dealerIds: string[];

  if (dealerId) {
    const dealer = await prisma.dealer.findUnique({
      where: { id: dealerId },
      select: { id: true },
    });
    if (!dealer) {
      return NextResponse.json({ error: "dealer not found" }, { status: 404 });
    }
    dealerIds = [dealerId];
  } else {
    const dealers = await prisma.dealer.findMany({
      where: { vertical: verticalFilter, active: true },
      select: { id: true },
    });
    dealerIds = dealers.map((d) => d.id);
  }

  const vehicles = await prisma.vehicle.findMany({
    where: { dealerId: { in: dealerIds }, archivedAt: null },
    select: { id: true, url: true, dealerId: true },
  });

  if (vehicles.length > 0) {
    await prisma.vehicle.updateMany({
      where: { id: { in: vehicles.map((v) => v.id) } },
      data: { scrapeStatus: "pending" },
    });

    after(() => rescrapeInBackground(vehicles));
  }

  // Audit log — await to guarantee persistence before response
  await writeAuditLog({
    action: "admin.feed_rescrape.trigger",
    actorEmail: auth.email,
    actorRole: auth.role,
    targetDealerId: dealerId ?? null,
    beforeState: {
      dealerId: dealerId ?? null,
      vertical: verticalFilter,
      scope: dealerId ? "single_dealer" : "bulk_vertical",
    },
    afterState: {
      dealerCount: dealerIds.length,
      vehicleCount: vehicles.length,
      status: "rescraping",
    },
    metadata: {
      scope: dealerId ? "single_dealer" : "bulk_vertical",
      vertical: verticalFilter,
      dealerCount: dealerIds.length,
      vehicleCount: vehicles.length,
    },
  });

  return NextResponse.json({
    dealerCount: dealerIds.length,
    vehicleCount: vehicles.length,
    status: "rescraping",
  });
}

export async function GET(request: NextRequest) {
  // Admin authorization
  const auth = await adminGuard("trigger_rescrape");
  if (!auth.ok) return auth.response!;

  const rawDealerId = request.nextUrl.searchParams.get("dealerId") ?? undefined;
  const queryParsed = adminFeedRescrapeQuerySchema.safeParse({ dealerId: rawDealerId });
  if (!queryParsed.success) {
    return NextResponse.json(
      { error: "validation_error", issues: queryParsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const dealerId = queryParsed.data.dealerId;

  const pendingCount = await prisma.vehicle.count({
    where: {
      scrapeStatus: "pending",
      archivedAt: null,
      ...(dealerId ? { dealerId } : {}),
    },
  });

  return NextResponse.json({ pendingCount });
}
