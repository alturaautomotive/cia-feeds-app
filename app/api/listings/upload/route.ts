import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkSubscription } from "@/lib/checkSubscription";
import { getRequiredFields } from "@/lib/verticals";
import { getEffectiveDealerId } from "@/lib/impersonation";
import Papa from "papaparse";

/** Map common CSV column name variants to canonical Meta keys. */
const HEADER_ALIASES: Record<string, string> = {
  // retailer_id
  sku: "retailer_id",
  "retailer id": "retailer_id",
  item_number: "retailer_id",
  product_id: "retailer_id",
  // url
  product_url: "url",
  link: "url",
  product_link: "url",
  // image_url
  image: "image_url",
  "image link": "image_url",
  image_link: "image_url",
  photo_url: "image_url",
  // google_product_category
  category: "google_product_category",
  product_category: "google_product_category",
  "google product category": "google_product_category",
  // title
  name: "title",
  product_name: "title",
  product_title: "title",
  // description
  product_description: "description",
  // brand
  manufacturer: "brand",
  // condition
  item_condition: "condition",
  // price
  sale_price: "price",
  list_price: "price",
};

/**
 * Normalize a single CSV row by mapping alias column names to canonical Meta keys.
 * When a canonical key already exists in the row, aliases are not applied for that key.
 */
function normalizeRow(row: Record<string, string>): Record<string, string> {
  const canonical: Record<string, string> = {};

  for (const [rawKey, value] of Object.entries(row)) {
    const lower = rawKey.trim().toLowerCase();
    const mapped = HEADER_ALIASES[lower] ?? lower;
    // Don't overwrite a canonical key that's already been set
    if (canonical[mapped] === undefined || !canonical[mapped]) {
      canonical[mapped] = value;
    }
  }

  return canonical;
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dealerId = await getEffectiveDealerId();
  if (!dealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isSubscribed = await checkSubscription(dealerId);
  if (!isSubscribed) {
    return NextResponse.json({ error: "subscription_required" }, { status: 403 });
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
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
  const results: { created: number; skipped: number; errors: Array<{ row: number; missingFields: string[] }> } = {
    created: 0,
    skipped: 0,
    errors: [],
  };

  const listings = [];
  for (let i = 0; i < parsed.data.length; i++) {
    const row = normalizeRow(parsed.data[i]);
    const title = row.title || row.name || "";
    if (!title) {
      results.skipped++;
      results.errors.push({ row: i + 1, missingFields: ["title/name"] });
      continue;
    }

    const missingFields = requiredFields.filter((f) => !row[f]?.trim());
    const price = row.price != null ? parseFloat(String(row.price).replace(/[^0-9.]/g, "")) : null;
    const imageUrls = row.image_url ? [row.image_url] : [];

    listings.push({
      dealerId,
      vertical,
      title,
      price: price != null && Number.isFinite(price) ? price : null,
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
