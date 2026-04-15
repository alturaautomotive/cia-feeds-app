import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rateLimit";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  // --- Rate Limiting ---
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded ? forwarded.split(",")[0].trim() : "unknown";
  const { allowed, retryAfterMs } = rateLimit(ip, 30, 60_000);

  if (!allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Retry-After": String(Math.ceil(retryAfterMs / 1000)),
        },
      }
    );
  }

  // --- Slug Resolution ---
  const { slug } = await params;

  const dealer = await prisma.dealer.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      vertical: true,
      name: true,
      phone: true,
      fbPageId: true,
      ctaPreference: true,
    },
  });

  if (!dealer) {
    return NextResponse.json(
      { error: "dealer_not_found" },
      { status: 404, headers: corsHeaders }
    );
  }

  // --- Fetch & Map Items ---
  let items: Record<string, unknown>[];

  if (dealer.vertical === "automotive") {
    const vehicles = await prisma.vehicle.findMany({
      where: { dealerId: dealer.id, archivedAt: null },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        make: true,
        model: true,
        year: true,
        price: true,
        imageUrl: true,
        images: true,
        url: true,
        mileageValue: true,
        stateOfVehicle: true,
        exteriorColor: true,
        bodyStyle: true,
      },
    });

    items = vehicles.map((v) => {
      const title =
        [v.year, v.make, v.model].filter(Boolean).join(" ") || "Vehicle";

      const details: Record<string, unknown> = {};
      if (v.mileageValue != null) details.mileage = v.mileageValue;
      if (v.stateOfVehicle != null) details.condition = v.stateOfVehicle;
      if (v.exteriorColor != null) details.color = v.exteriorColor;
      if (v.bodyStyle != null) details.bodyStyle = v.bodyStyle;

      return {
        id: v.id,
        title,
        price: v.price ?? null,
        image: v.imageUrl ?? (v.images as string[] | null)?.[0] ?? null,
        url: v.url,
        details,
      };
    });
  } else {
    const listings = await prisma.listing.findMany({
      where: { dealerId: dealer.id, vertical: dealer.vertical, archivedAt: null },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        title: true,
        price: true,
        imageUrls: true,
        url: true,
        data: true,
      },
    });

    items = listings.map((listing) => {
      const data = (listing.data as Record<string, unknown>) ?? {};
      const details: Record<string, unknown> = {};

      if (dealer.vertical === "ecommerce") {
        if (data.brand != null) details.brand = data.brand;
        if (data.category != null) details.category = data.category;
        if (data.condition != null) details.condition = data.condition;
      } else if (dealer.vertical === "services") {
        if (data.category != null) details.category = data.category;
        if (data.address != null) details.address = data.address;
        if (data.brand != null) details.brand = data.brand;
      } else if (dealer.vertical === "realestate") {
        if (data.num_beds != null) details.beds = data.num_beds;
        if (data.num_baths != null) details.baths = data.num_baths;
        if (data.area_size != null) details.sqft = data.area_size;
        if (data.address != null) details.address = data.address;
        if (data.city != null) details.city = data.city;
        if (data.region != null) details.region = data.region;
        if (data.property_type != null) details.propertyType = data.property_type;
      }

      return {
        id: listing.id,
        title: listing.title,
        price: listing.price,
        image: (listing.imageUrls as string[] | null)?.[0] ?? null,
        url: listing.url,
        details,
      };
    });
  }

  // --- Response ---
  // NOTE: phone and fbPageId are exposed publicly via this unauthenticated endpoint.
  // Dealers should be aware that adding a phone number or Facebook Page ID makes
  // it publicly accessible through this catalog API. Consider adding an
  // `embedEnabled` opt-in flag on the Dealer model to gate this exposure.
  return NextResponse.json(
    {
      dealer: {
        name: dealer.name,
        slug: dealer.slug,
        vertical: dealer.vertical,
        phone: dealer.phone ?? null,
        fbPageId: dealer.fbPageId ?? null,
        ctaPreference: dealer.ctaPreference ?? null,
      },
      items,
    },
    {
      headers: {
        ...corsHeaders,
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    }
  );
}
