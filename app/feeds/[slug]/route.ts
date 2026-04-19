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
          const hasUrl = !!v.url;
          // Absolute-minimum gate: only skip if both url and image are missing.
          // All other fields are now filled by fallbacks in mapVehicleToRow.
          if (!hasUrl && !hasImage) {
            console.log({ event: 'csv_skip_no_url_no_image', vehicleId: v.id });
            skippedCount++;
            continue;
          }
          const row = mapVehicleToRow(v);

          // Diagnostic: flag any remaining empty cells. Row is still emitted.
          const emptyFields = VEHICLE_CSV_HEADERS.filter((h) => {
            const value = row[h];
            return value === "" || value === undefined || value === null;
          });
          if (emptyFields.length > 0) {
            console.warn({ event: 'csv_empty_cells_warning', vehicleId: v.id, emptyFields });
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
      let skippedCount = 0;

      while (true) {
        const batch = await prisma.listing.findMany({
          where: {
            dealerId,
            vertical,
            archivedAt: null,
            ...(vertical === "services" ? { publishStatus: "published" } : {}),
          },
          orderBy: { createdAt: "asc" },
          take: BATCH_SIZE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });

        for (const listing of batch) {
          if (vertical === "services") {
            const firstImage = listing.imageUrls[0];
            if (
              !firstImage ||
              firstImage === "https://placehold.co/600x400?text=No+Image"
            ) {
              console.log({ event: "feed_skip_no_valid_image", listingId: listing.id });
              skippedCount++;
              continue;
            }
          }
          const data = listing.data as Record<string, unknown>;
          const row = vertical === "services"
            ? serializeServicesRow({ ...listing, data })
            : mapListingToRow({ ...listing, data });
          controller.enqueue(encoder.encode(serializeCSVRow(row, csvHeaders)));
          listingCount++;
        }

        if (batch.length < BATCH_SIZE) {
          logCsvGeneration({ slug, dealerId, vehicleCount: listingCount, skippedCount, durationMs: Date.now() - startMs });
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
