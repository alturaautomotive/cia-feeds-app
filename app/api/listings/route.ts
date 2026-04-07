import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkSubscription } from "@/lib/checkSubscription";
import { getRequiredFields } from "@/lib/verticals";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isSubscribed = await checkSubscription(session.user.id);
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

  const dealer = await prisma.dealer.findUnique({
    where: { id: session.user.id },
    select: { vertical: true },
  });

  if (!dealer) {
    return NextResponse.json({ error: "dealer_not_found" }, { status: 404 });
  }

  const vertical = dealer.vertical;

  if (vertical === "automotive") {
    return NextResponse.json(
      { error: "Use /api/vehicles/from-url for automotive listings" },
      { status: 400 }
    );
  }

  // Extract title from vertical-appropriate field
  const title = String(b.title || b.name || "");
  if (!title) {
    return NextResponse.json({ error: "title or name is required" }, { status: 400 });
  }

  // Build data payload (everything except internal fields)
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(b)) {
    if (k !== "imageUrls") {
      data[k] = v;
    }
  }

  // Check required fields
  const requiredFields = getRequiredFields(vertical);
  const missingFields = requiredFields.filter((f) => {
    if (f === "image_url") return false; // handled separately below
    const val = data[f];
    return val === undefined || val === null || val === "";
  });

  const price = data.price != null ? parseFloat(String(data.price).replace(/[^0-9.]/g, "")) : null;
  const imageUrls = Array.isArray(b.imageUrls) ? (b.imageUrls as string[]) : [];
  const url = typeof data.url === "string" ? data.url : null;

  // Validate image requirement for non-automotive verticals
  if (requiredFields.includes("image_url") && imageUrls.length === 0) {
    missingFields.push("image_url");
  }

  const listing = await prisma.listing.create({
    data: {
      dealerId: session.user.id,
      vertical,
      title,
      price: Number.isFinite(price) ? price : null,
      imageUrls,
      url,
      isComplete: missingFields.length === 0,
      missingFields,
      data: data as Record<string, string>,
    },
  });

  return NextResponse.json({ listing }, { status: 201 });
}

export async function GET(_request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: session.user.id },
    select: { vertical: true },
  });

  if (!dealer || dealer.vertical === "automotive") {
    return NextResponse.json({ listings: [] });
  }

  const listings = await prisma.listing.findMany({
    where: {
      dealerId: session.user.id,
      vertical: dealer.vertical,
      archivedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ listings });
}
