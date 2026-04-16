export const maxDuration = 300;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse, after } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { scrapeVehicleUrl } from "@/lib/scrape";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "").toLowerCase();
const RESCRAPE_BATCH_SIZE = 5;
const RESCRAPE_BATCH_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function rescrapeInBackground(
  vehicles: { id: string; url: string; dealerId: string }[]
): Promise<void> {
  for (let i = 0; i < vehicles.length; i += RESCRAPE_BATCH_SIZE) {
    const batch = vehicles.slice(i, i + RESCRAPE_BATCH_SIZE);

    await Promise.all(
      batch.map(async (vehicle) => {
        try {
          const { vehicle: scraped, fieldsExtracted } = await scrapeVehicleUrl(
            vehicle.url,
            vehicle.dealerId
          );

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
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error({
            event: "rescrape_error",
            vehicleId: vehicle.id,
            url: vehicle.url,
            message,
          });

          try {
            await prisma.vehicle.update({
              where: { id: vehicle.id },
              data: { scrapeStatus: "failed" },
            });
          } catch (fallbackErr) {
            console.error({
              event: "rescrape_fallback_status_error",
              vehicleId: vehicle.id,
              message:
                fallbackErr instanceof Error
                  ? fallbackErr.message
                  : String(fallbackErr),
            });
          }
        }
      })
    );

    if (i + RESCRAPE_BATCH_SIZE < vehicles.length) {
      await sleep(RESCRAPE_BATCH_DELAY_MS);
    }
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (
    !session?.user?.email ||
    session.user.email.toLowerCase() !== ADMIN_EMAIL
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { dealerId?: string; vertical?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { dealerId, vertical } = body;
  const resolvedVertical = vertical ?? "automotive";

  let dealers: { id: string }[];
  if (dealerId) {
    const dealer = await prisma.dealer.findUnique({
      where: { id: dealerId },
      select: { id: true },
    });
    if (!dealer) {
      return NextResponse.json({ error: "dealer not found" }, { status: 404 });
    }
    dealers = [dealer];
  } else {
    dealers = await prisma.dealer.findMany({
      where: { vertical: resolvedVertical, active: true },
      select: { id: true },
    });
  }

  const dealerIds = dealers.map((d) => d.id);

  const vehicles = await prisma.vehicle.findMany({
    where: {
      dealerId: { in: dealerIds },
      archivedAt: null,
    },
    select: { id: true, url: true, dealerId: true },
  });

  if (vehicles.length === 0) {
    return NextResponse.json(
      { dealerCount: dealers.length, vehicleCount: 0, status: "no_vehicles" },
      { status: 200 }
    );
  }

  await prisma.vehicle.updateMany({
    where: {
      id: { in: vehicles.map((v) => v.id) },
    },
    data: { scrapeStatus: "pending" },
  });

  after(() => rescrapeInBackground(vehicles));

  return NextResponse.json({
    dealerCount: dealers.length,
    vehicleCount: vehicles.length,
    status: "rescraping",
  });
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (
    !session?.user?.email ||
    session.user.email.toLowerCase() !== ADMIN_EMAIL
  ) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const dealerId = request.nextUrl.searchParams.get("dealerId");

  const pendingCount = await prisma.vehicle.count({
    where: {
      ...(dealerId ? { dealerId } : {}),
      scrapeStatus: "pending",
    },
  });

  return NextResponse.json({ pendingCount });
}
