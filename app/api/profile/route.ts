import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkSubscription } from "@/lib/checkSubscription";
import { getEffectiveDealerContext } from "@/lib/impersonation";

const VALID_VERTICALS = ["automotive", "services", "ecommerce", "realestate"];

const SAFE_SELECT = {
  id: true,
  name: true,
  email: true,
  slug: true,
  profileImageUrl: true,
  vertical: true,
  websiteUrl: true,
  autoCrawlEnabled: true,
  address: true,
  latitude: true,
  longitude: true,
} as const;

export async function GET() {
  const { effectiveDealerId } = await getEffectiveDealerContext();
  if (!effectiveDealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: effectiveDealerId },
    select: SAFE_SELECT,
  });

  if (!dealer) {
    return NextResponse.json({ error: "dealer_not_found" }, { status: 404 });
  }

  return NextResponse.json({ dealer });
}

export async function PATCH(request: NextRequest) {
  const { effectiveDealerId } = await getEffectiveDealerContext();
  if (!effectiveDealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isSubscribed = await checkSubscription(effectiveDealerId);
  if (!isSubscribed) {
    return NextResponse.json({ error: "subscription_required" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  // Handle profile image removal
  if ("profileImageUrl" in b && b.profileImageUrl === null) {
    await prisma.dealer.update({
      where: { id: effectiveDealerId },
      data: { profileImageUrl: null },
    });
  }

  // Handle websiteUrl update
  if ("websiteUrl" in b) {
    const websiteUrl = b.websiteUrl;
    if (websiteUrl !== null && typeof websiteUrl !== "string") {
      return NextResponse.json({ error: "invalid_websiteUrl" }, { status: 400 });
    }
    const urlToSave = typeof websiteUrl === "string" && websiteUrl.trim() ? websiteUrl.trim() : null;
    if (urlToSave) {
      try {
        const parsed = new URL(urlToSave);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return NextResponse.json({ error: "invalid_websiteUrl" }, { status: 400 });
        }
      } catch {
        return NextResponse.json({ error: "invalid_websiteUrl" }, { status: 400 });
      }
    }
    await prisma.dealer.update({
      where: { id: effectiveDealerId },
      data: { websiteUrl: urlToSave },
    });
  }

  // Handle address update (+ geocoding)
  if ("address" in b) {
    const rawAddress = b.address;
    if (rawAddress !== null && typeof rawAddress !== "string") {
      return NextResponse.json({ error: "invalid_address" }, { status: 400 });
    }
    const addressToSave =
      typeof rawAddress === "string" && rawAddress.trim() ? rawAddress.trim() : null;

    if (addressToSave === null) {
      await prisma.dealer.update({
        where: { id: effectiveDealerId },
        data: { address: null, latitude: null, longitude: null },
      });
    } else {
      try {
        const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
          addressToSave
        )}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
        const res = await fetch(geocodeUrl);
        if (!res.ok) {
          return NextResponse.json({ error: "geocoding_failed" }, { status: 400 });
        }
        const data = (await res.json()) as {
          status?: string;
          results?: Array<{
            geometry?: { location?: { lat?: number; lng?: number } };
          }>;
        };
        const location = data?.results?.[0]?.geometry?.location;
        const lat = location?.lat;
        const lng = location?.lng;
        if (
          data?.status !== "OK" ||
          typeof lat !== "number" ||
          typeof lng !== "number"
        ) {
          return NextResponse.json({ error: "geocoding_failed" }, { status: 400 });
        }
        await prisma.dealer.update({
          where: { id: effectiveDealerId },
          data: { address: addressToSave, latitude: lat, longitude: lng },
        });
      } catch {
        return NextResponse.json({ error: "geocoding_failed" }, { status: 400 });
      }
    }
  }

  // Handle autoCrawlEnabled toggle
  if ("autoCrawlEnabled" in b) {
    if (typeof b.autoCrawlEnabled !== "boolean") {
      return NextResponse.json({ error: "invalid_autoCrawlEnabled" }, { status: 400 });
    }
    await prisma.dealer.update({
      where: { id: effectiveDealerId },
      data: { autoCrawlEnabled: b.autoCrawlEnabled },
    });
  }

  // Handle vertical switch
  if ("vertical" in b) {
    if (typeof b.vertical !== "string" || !VALID_VERTICALS.includes(b.vertical)) {
      return NextResponse.json({ error: "invalid_vertical" }, { status: 400 });
    }

    const newVertical = b.vertical;

    const dealer = await prisma.dealer.findUnique({
      where: { id: effectiveDealerId },
      select: { vertical: true },
    });

    if (!dealer) {
      return NextResponse.json({ error: "dealer_not_found" }, { status: 404 });
    }

    const oldVertical = dealer.vertical;

    if (oldVertical !== newVertical) {
      const now = new Date();

      let updatedDealer;

      await prisma.$transaction(async (tx) => {
        // Archive current inventory for the old vertical
        if (oldVertical === "automotive") {
          await tx.vehicle.updateMany({
            where: { dealerId: effectiveDealerId, archivedAt: null },
            data: { archivedAt: now },
          });
        } else {
          await tx.listing.updateMany({
            where: {
              dealerId: effectiveDealerId,
              vertical: oldVertical,
              archivedAt: null,
            },
            data: { archivedAt: now },
          });
        }

        // Restore any previously archived inventory for the new vertical
        if (newVertical === "automotive") {
          await tx.vehicle.updateMany({
            where: { dealerId: effectiveDealerId, archivedAt: { not: null } },
            data: { archivedAt: null },
          });
        } else {
          await tx.listing.updateMany({
            where: {
              dealerId: effectiveDealerId,
              vertical: newVertical,
              archivedAt: { not: null },
            },
            data: { archivedAt: null },
          });
        }

        // Update dealer vertical
        updatedDealer = await tx.dealer.update({
          where: { id: effectiveDealerId },
          data: { vertical: newVertical },
          select: SAFE_SELECT,
        });
      });

      return NextResponse.json({ ok: true, dealer: updatedDealer });
    }
  }

  const currentDealer = await prisma.dealer.findUnique({
    where: { id: effectiveDealerId },
    select: SAFE_SELECT,
  });
  return NextResponse.json({ ok: true, dealer: currentDealer });
}
