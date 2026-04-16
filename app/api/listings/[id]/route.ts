import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkSubscription } from "@/lib/checkSubscription";
import { getEffectiveDealerId } from "@/lib/impersonation";
import {
  computeCompletenessFromMerged,
  checkServicesCompleteness,
  SERVICES_COMPLETENESS_FIELDS,
  type FieldSource,
  type FieldSourcesMap,
} from "@/lib/serviceUrlValidator";
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

  // Recalculate isComplete and missingFields based on merged data.
  // `hasTopLevelPrice` mirrors the top-level `Listing.price` column so that
  // completeness matches the validate-url route's view, regardless of whether
  // `price` also lives inside `data`.
  const existingData = (listing.data as Record<string, unknown>) ?? {};
  const patchData =
    typeof b.data === "object" && b.data !== null
      ? (b.data as Record<string, unknown>)
      : {};
  const mergedData: Record<string, unknown> = {
    ...existingData,
    ...patchData,
  };
  const nextTitle = typeof updateData.title === "string" ? updateData.title : listing.title;
  const nextImageUrls = Array.isArray(updateData.imageUrls)
    ? (updateData.imageUrls as string[])
    : listing.imageUrls;

  let missingFields: string[];
  let isComplete: boolean;

  if (listing.vertical === "services") {
    // For services, use the dedicated 11-field completeness check.
    const completeness = checkServicesCompleteness(
      mergedData,
      nextImageUrls,
      nextTitle
    );
    missingFields = completeness.missingFields;
    isComplete = completeness.isComplete;

    // Update fieldSources: any field that the user just edited via `b.data`
    // gets tagged as `user_entered`. Existing tags are preserved otherwise.
    const existingSources =
      (existingData.fieldSources as FieldSourcesMap | undefined) ?? {};
    const patchSources = patchData.fieldSources as FieldSourcesMap | undefined;
    const nextSources: FieldSourcesMap = { ...existingSources };
    for (const field of SERVICES_COMPLETENESS_FIELDS) {
      if (patchSources && patchSources[field]) {
        nextSources[field] = patchSources[field];
        continue;
      }
      if (Object.prototype.hasOwnProperty.call(patchData, field)) {
        const val = patchData[field];
        const nonEmpty =
          val !== null &&
          val !== undefined &&
          !(typeof val === "string" && val.trim() === "");
        nextSources[field] = nonEmpty
          ? "user_entered"
          : (existingSources[field] as FieldSource | undefined) ?? "missing";
      } else if (!nextSources[field]) {
        // Seed any unseen fields based on the merged value.
        const val = mergedData[field];
        const nonEmpty =
          val !== null &&
          val !== undefined &&
          !(typeof val === "string" && val.trim() === "");
        nextSources[field] = nonEmpty ? "scraped" : "missing";
      }
    }
    mergedData.fieldSources = nextSources;
    updateData.data = mergedData as Prisma.InputJsonValue;

    // Auto-promote `validated` → `ready_to_publish` once all fields are filled.
    const nextPublishStatus =
      typeof updateData.publishStatus === "string"
        ? (updateData.publishStatus as string)
        : listing.publishStatus;
    if (nextPublishStatus === "validated" && isComplete) {
      updateData.publishStatus = "ready_to_publish";
    }
  } else {
    const result = computeCompletenessFromMerged({
      vertical: listing.vertical,
      title: nextTitle,
      hasTopLevelPrice: updateData.price != null || listing.price != null,
      data: mergedData,
      imageUrls: nextImageUrls,
    });
    missingFields = result.missingFields;
    isComplete = result.isComplete;
  }

  updateData.missingFields = missingFields;
  updateData.isComplete = isComplete;

  const updated = await prisma.listing.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({ listing: updated });
}
