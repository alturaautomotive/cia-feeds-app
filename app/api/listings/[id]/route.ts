import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkSubscription } from "@/lib/checkSubscription";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { getRequiredFields } from "@/lib/verticals";
import type { Prisma } from "@prisma/client";

const ALLOWED_PUBLISH_STATUSES = [
  "draft",
  "validated",
  "ready_to_publish",
  "published",
  "blocked",
] as const;

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const effectiveDealerId = await getEffectiveDealerId();
  if (!effectiveDealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isSubscribed = await checkSubscription(effectiveDealerId);
  if (!isSubscribed) {
    return NextResponse.json({ error: "subscription_required" }, { status: 403 });
  }

  const { id } = await params;

  const listing = await prisma.listing.findFirst({
    where: { id, dealerId: effectiveDealerId },
  });

  if (!listing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await prisma.listing.delete({ where: { id } });

  return NextResponse.json({ success: true });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const dealerId = await getEffectiveDealerId();
  if (!dealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isSubscribed = await checkSubscription(dealerId);
  if (!isSubscribed) {
    return NextResponse.json({ error: "subscription_required" }, { status: 403 });
  }

  const { id } = await params;

  const listing = await prisma.listing.findFirst({
    where: { id, dealerId },
  });

  if (!listing) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;

  // Publish gate for services vertical
  if (listing.vertical === "services" && b.publishStatus === "published") {
    if (listing.urlValidationScore == null) {
      return NextResponse.json({ error: "url_validation_required" }, { status: 403 });
    }
    if (listing.publishStatus === "blocked") {
      return NextResponse.json({ error: "url_blocked" }, { status: 403 });
    }
  }

  const updateData: Prisma.ListingUpdateInput = {};

  if (typeof b.title === "string") {
    updateData.title = b.title;
  }
  if (b.price === null) {
    updateData.price = null;
  } else if (typeof b.price === "number" && Number.isFinite(b.price)) {
    updateData.price = b.price;
  } else if (typeof b.price === "string") {
    const raw = b.price.trim();
    if (listing.vertical === "services") {
      const numericOnly = raw.replace(/^\$/, "").replace(/,/g, "");
      if (/^\d+(\.\d+)?$/.test(numericOnly)) {
        updateData.price = parseFloat(numericOnly);
      }
    } else {
      const parsed = parseFloat(raw.replace(/[^0-9.]/g, ""));
      if (Number.isFinite(parsed)) {
        updateData.price = parsed;
      }
    }
  }
  if (Array.isArray(b.imageUrls)) {
    updateData.imageUrls = (b.imageUrls as unknown[]).filter(
      (u): u is string => typeof u === "string"
    );
  }
  if (typeof b.url === "string" || b.url === null) {
    updateData.url = b.url as string | null;
  }
  if (b.data !== undefined && b.data !== null && typeof b.data === "object") {
    updateData.data = b.data as Prisma.InputJsonValue;
  }
  if (typeof b.publishStatus === "string") {
    if (!ALLOWED_PUBLISH_STATUSES.includes(b.publishStatus as typeof ALLOWED_PUBLISH_STATUSES[number])) {
      return NextResponse.json(
        { error: "invalid_publish_status", allowed: ALLOWED_PUBLISH_STATUSES },
        { status: 400 }
      );
    }
    updateData.publishStatus = b.publishStatus;
  }

  // Recalculate isComplete and missingFields based on merged data
  const mergedData: Record<string, unknown> = {
    ...((listing.data as Record<string, unknown>) ?? {}),
    ...(typeof b.data === "object" && b.data !== null ? (b.data as Record<string, unknown>) : {}),
  };
  const nextTitle = typeof updateData.title === "string" ? updateData.title : listing.title;
  const nextImageUrls = Array.isArray(updateData.imageUrls)
    ? (updateData.imageUrls as string[])
    : listing.imageUrls;

  const requiredFields = getRequiredFields(listing.vertical);
  const missingFields = requiredFields.filter((f) => {
    if (f === "image_url") return false;
    if (f === "title" || f === "name") {
      return !nextTitle || nextTitle.trim() === "";
    }
    const val = mergedData[f];
    if (val === undefined || val === null) return true;
    if (typeof val === "string" && val.trim() === "") return true;
    return false;
  });
  if (requiredFields.includes("image_url") && nextImageUrls.length === 0) {
    missingFields.push("image_url");
  }

  updateData.missingFields = missingFields;
  updateData.isComplete = missingFields.length === 0;

  const updated = await prisma.listing.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({ listing: updated });
}
