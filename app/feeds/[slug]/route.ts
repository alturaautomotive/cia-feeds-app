import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeCSVHeader, serializeCSVRow } from "@/lib/csv";
import { logCsvGeneration } from "@/lib/logger";

const CSV_HEADERS = [
  "vehicle_id",
  "description",
  "vin",
  "make",
  "model",
  "year",
  "body_style",
  "price",
  "mileage_value",
  "state_of_vehicle",
  "exterior_color",
  "url",
  "image_url",
];

const BATCH_SIZE = 100;

function mapVehicleToRow(v: {
  id: string;
  description: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
  year: string | null;
  bodyStyle: string | null;
  price: number | null;
  mileageValue: number | null;
  stateOfVehicle: string | null;
  exteriorColor: string | null;
  url: string;
  imageUrl: string | null;
}): Record<string, unknown> {
  return {
    vehicle_id: v.id,
    description: v.description ?? "",
    vin: v.vin ?? "",
    make: v.make ?? "",
    model: v.model ?? "",
    year: v.year ?? "",
    body_style: v.bodyStyle ?? "",
    price: String(v.price ?? ""),
    mileage_value: String(v.mileageValue ?? ""),
    state_of_vehicle: v.stateOfVehicle ?? "",
    exterior_color: v.exteriorColor ?? "",
    url: v.url,
    image_url: v.imageUrl ?? "",
  };
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug: rawSlug } = await params;
  const slug = rawSlug.replace(/\.csv$/i, "");

  const dealer = await prisma.dealer.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });

  if (!dealer) {
    return NextResponse.json({ error: "dealer_not_found" }, { status: 404 });
  }

  const startMs = Date.now();
  const encoder = new TextEncoder();
  const dealerId = dealer.id;

  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(serializeCSVHeader(CSV_HEADERS)));

      let cursor: string | undefined;
      let vehicleCount = 0;

      while (true) {
        const batch = await prisma.vehicle.findMany({
          where: { dealerId },
          orderBy: { createdAt: "asc" },
          take: BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });

        for (const v of batch) {
          controller.enqueue(
            encoder.encode(serializeCSVRow(mapVehicleToRow(v), CSV_HEADERS))
          );
        }

        vehicleCount += batch.length;

        if (batch.length < BATCH_SIZE) {
          logCsvGeneration({ slug, dealerId, vehicleCount, durationMs: Date.now() - startMs });
          break;
        }

        cursor = batch[batch.length - 1].id;
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}.csv"`,
      "Cache-Control": "public, max-age=60",
    },
  });
}
