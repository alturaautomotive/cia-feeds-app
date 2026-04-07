import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkSubscription } from "@/lib/checkSubscription";
import { getRequiredFields } from "@/lib/verticals";
import Papa from "papaparse";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isSubscribed = await checkSubscription(session.user.id);
  if (!isSubscribed) {
    return NextResponse.json({ error: "subscription_required" }, { status: 403 });
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: session.user.id },
    select: { vertical: true },
  });

  const UPLOAD_ALLOWED_VERTICALS = ["ecommerce", "realestate"];

  if (!dealer || !UPLOAD_ALLOWED_VERTICALS.includes(dealer.vertical)) {
    return NextResponse.json(
      { error: `CSV upload is not available for the ${dealer?.vertical ?? "unknown"} vertical` },
      { status: 400 }
    );
  }

  const vertical = dealer.vertical;

  const formData = await request.formData();
  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }

  const csvText = await file.text();
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return NextResponse.json(
      { error: "csv_parse_error", details: parsed.errors.slice(0, 5) },
      { status: 400 }
    );
  }

  const requiredFields = getRequiredFields(vertical);
  const results: { created: number; errors: Array<{ row: number; missingFields: string[] }> } = {
    created: 0,
    errors: [],
  };

  const listings = [];
  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const title = row.title || row.name || "";
    if (!title) {
      results.errors.push({ row: i + 1, missingFields: ["title/name"] });
      continue;
    }

    const missingFields = requiredFields.filter((f) => !row[f]?.trim());
    const price = row.price ? parseFloat(String(row.price).replace(/[^0-9.]/g, "")) : null;
    const imageUrls = row.image_url ? [row.image_url] : [];

    listings.push({
      dealerId: session.user.id,
      vertical,
      title,
      price: price && Number.isFinite(price) ? price : null,
      imageUrls,
      url: row.url || null,
      isComplete: missingFields.length === 0,
      missingFields,
      data: row as Record<string, string>,
    });
  }

  if (listings.length > 0) {
    const created = await prisma.listing.createMany({ data: listings });
    results.created = created.count;
  }

  return NextResponse.json(results, { status: 201 });
}
