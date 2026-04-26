export const maxDuration = 300;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse, after } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Vertical } from "@prisma/client";
import { scrapeVehicleUrl } from "@/lib/scrape";
import { dispatchFeedDeliveryInBackground } from "@/lib/metaDelivery";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "").toLowerCase();

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
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.email.toLowerCase() !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { dealerId, vertical } = (await request.json()) as {
    dealerId?: string;
    vertical?: string;
  };
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

  return NextResponse.json({
    dealerCount: dealerIds.length,
    vehicleCount: vehicles.length,
    status: "rescraping",
  });
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email || session.user.email.toLowerCase() !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const dealerId = request.nextUrl.searchParams.get("dealerId");

  const pendingCount = await prisma.vehicle.count({
    where: {
      scrapeStatus: "pending",
      archivedAt: null,
      ...(dealerId ? { dealerId } : {}),
    },
  });

  return NextResponse.json({ pendingCount });
}
