import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { serializeCSVHeader, serializeCSVRow, mapListingToRow, serializeServicesRow, getCSVHeadersForVertical, VEHICLE_CSV_HEADERS, mapVehicleToRow } from "@/lib/csv";
import { logCsvGeneration } from "@/lib/logger";

const BATCH_SIZE = 100;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug: rawSlug } = await params;
  const slug = rawSlug.replace(/\.csv$/i, "");

  const dealer = await prisma.dealer.findUnique({
    where: { slug },
    select: { id: true, name: true, vertical: true, address: true },
  });

  if (!dealer) {
    return NextResponse.json({ error: "dealer_not_found" }, { status: 404 });
  }

  if (!dealer.address?.trim()) {
    return NextResponse.json({ error: "dealer_address_required" }, { status: 422 });
  }

  const startMs = Date.now();
  const encoder = new TextEncoder();
  const dealerId = dealer.id;
  const vertical = dealer.vertical;

  // Route to the correct CSV serializer based on vertical
  if (vertical === "automotive") {
    return streamAutomotiveCSV(encoder, dealerId, slug, startMs);
  }

  const headers = getCSVHeadersForVertical(vertical);
  if (headers.length === 0) {
    return NextResponse.json({ error: "unsupported_vertical" }, { status: 400 });
  }

  return streamListingsCSV(encoder, dealerId, vertical, headers, slug, startMs);
}

function streamAutomotiveCSV(
  encoder: TextEncoder,
  dealerId: string,
  slug: string,
  startMs: number,
) {
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(serializeCSVHeader(VEHICLE_CSV_HEADERS)));

      let cursor: string | undefined;
      let vehicleCount = 0;
      let skippedCount = 0;

      while (true) {
        const batch = await prisma.vehicle.findMany({
          where: { dealerId, archivedAt: null },
          include: {
            dealer: {
              select: {
                name: true,
                address: true,
                fbPageId: true,
                latitude: true,
                longitude: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
          take: BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });

        for (const v of batch) {
          const hasImage = !!(v.imageUrl || (v.images && (v.images as string[]).length > 0));
          if (!hasImage) {
            console.log({ event: 'csv_missing_image', vehicleId: v.id, rawAddress: v.address, dealerAddress: v.dealer?.address, imageUrl: v.imageUrl, images: v.images });
            skippedCount++;
            continue;
          }
          const row = mapVehicleToRow(v);
          if (!row.url) {
            console.log({ event: 'csv_missing_url', vehicleId: v.id, rawAddress: v.address, dealerAddress: v.dealer?.address, street_address: row.street_address, city: row.city, region: row.region, url: row.url, "image[0].url": row["image[0].url"], state_of_vehicle: row.state_of_vehicle, body_style: row.body_style });
            skippedCount++;
            continue;
          }
          if (row["image[0].url"] === "") {
            console.log({ event: 'csv_image_filtered_out', vehicleId: v.id, rawAddress: v.address, dealerAddress: v.dealer?.address, street_address: row.street_address, city: row.city, region: row.region, url: row.url, "image[0].url": row["image[0].url"], state_of_vehicle: row.state_of_vehicle, body_style: row.body_style });
            skippedCount++;
            continue;
          }
          if (row.street_address === "" && row.city === "" && row.region === "") {
            console.log({ event: 'csv_missing_address', vehicleId: v.id, rawAddress: v.address, dealerAddress: v.dealer?.address, street_address: row.street_address, city: row.city, region: row.region, url: row.url, "image[0].url": row["image[0].url"], state_of_vehicle: row.state_of_vehicle, body_style: row.body_style });
            skippedCount++;
            continue;
          }
          controller.enqueue(encoder.encode(serializeCSVRow(row, VEHICLE_CSV_HEADERS)));
          vehicleCount++;
        }

        if (batch.length < BATCH_SIZE) {
          logCsvGeneration({ slug, dealerId, vehicleCount, skippedCount, durationMs: Date.now() - startMs });
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

function streamListingsCSV(
  encoder: TextEncoder,
  dealerId: string,
  vertical: string,
  csvHeaders: string[],
  slug: string,
  startMs: number,
) {
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(serializeCSVHeader(csvHeaders)));

      let cursor: string | undefined;
      let listingCount = 0;

      while (true) {
        const batch = await prisma.listing.findMany({
          where: { dealerId, vertical, archivedAt: null },
          orderBy: { createdAt: "asc" },
          take: BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });

        for (const listing of batch) {
          const data = listing.data as Record<string, unknown>;
          const row = vertical === "services"
            ? serializeServicesRow({ ...listing, data })
            : mapListingToRow({ ...listing, data });
          controller.enqueue(encoder.encode(serializeCSVRow(row, csvHeaders)));
        }

        listingCount += batch.length;

        if (batch.length < BATCH_SIZE) {
          logCsvGeneration({ slug, dealerId, vehicleCount: listingCount, durationMs: Date.now() - startMs });
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
