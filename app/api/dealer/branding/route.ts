import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { BRAND_PRESETS, getBrandPreset } from "@/lib/brandPresets";
import { writeAuditLog } from "@/lib/adminAudit";

/**
 * GET   /api/dealer/branding -> { themePreset, themeOverrides, logoUrl, presetKeys }
 * PUT   /api/dealer/branding -> updates theme + logo for the authenticated dealer
 *
 * Audit-logged. Theme overrides are sanitized inside getBrandPreset() before
 * persistence is meaningful, but we also do a JSON shape check here so bogus
 * keys can't bloat the row.
 */

const ALLOWED_OVERRIDE_KEYS = new Set([
  "primary",
  "primaryForeground",
  "background",
  "foreground",
  "surface",
  "surfaceForeground",
  "accent",
  "border",
  "radius",
  "fontFamily",
]);

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dealerId = await getEffectiveDealerId();
  if (!dealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: {
      themePreset: true,
      themeOverrides: true,
      logoUrl: true,
      profileImageUrl: true,
    },
  });

  return NextResponse.json({
    themePreset: dealer?.themePreset ?? "neutral",
    themeOverrides: dealer?.themeOverrides ?? null,
    logoUrl: dealer?.logoUrl ?? null,
    profileImageUrl: dealer?.profileImageUrl ?? null,
    // Surface preset list so the UI doesn't need to import the lib client-side.
    presets: Object.fromEntries(
      Object.entries(BRAND_PRESETS).map(([k, v]) => [
        k,
        { label: v.label, primary: v.primary },
      ])
    ),
    // Resolved preview \u2014 useful for the live thumbnail.
    resolved: getBrandPreset(dealer?.themePreset, dealer?.themeOverrides as Record<string, unknown> | null),
  });
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dealerId = await getEffectiveDealerId();
  if (!dealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { themePreset?: string; themeOverrides?: unknown; logoUrl?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Validate themePreset
  let themePreset: string | undefined;
  if (typeof body.themePreset === "string") {
    if (!(body.themePreset in BRAND_PRESETS)) {
      return NextResponse.json({ error: "unknown_preset" }, { status: 400 });
    }
    themePreset = body.themePreset;
  }

  // Validate + filter themeOverrides
  let themeOverrides: Record<string, string> | null = null;
  if (body.themeOverrides && typeof body.themeOverrides === "object") {
    const filtered: Record<string, string> = {};
    for (const [k, v] of Object.entries(body.themeOverrides)) {
      if (ALLOWED_OVERRIDE_KEYS.has(k) && typeof v === "string" && v.length <= 32) {
        filtered[k] = v;
      }
    }
    if (Object.keys(filtered).length > 0) themeOverrides = filtered;
  }

  // Validate logoUrl
  let logoUrl: string | null | undefined;
  if (body.logoUrl === null) {
    logoUrl = null;
  } else if (typeof body.logoUrl === "string") {
    if (body.logoUrl.length > 2048) {
      return NextResponse.json({ error: "logoUrl_too_long" }, { status: 400 });
    }
    if (!/^https?:\/\//.test(body.logoUrl)) {
      return NextResponse.json({ error: "logoUrl_must_be_http" }, { status: 400 });
    }
    logoUrl = body.logoUrl;
  }

  // Prisma's Json input type rejects Record<string, string> directly even
  // though it serializes fine — cast through `unknown` once at the boundary.
  const updateData: Record<string, unknown> = {};
  if (themePreset !== undefined) updateData.themePreset = themePreset;
  if (body.themeOverrides !== undefined) updateData.themeOverrides = themeOverrides as unknown;
  if (logoUrl !== undefined) updateData.logoUrl = logoUrl;

  const updated = await prisma.dealer.update({
    where: { id: dealerId },
    data: updateData,
    select: {
      themePreset: true,
      themeOverrides: true,
      logoUrl: true,
    },
  });

  await writeAuditLog({
    action: "dealer.branding.update",
    actorEmail: session.user.email ?? "unknown",
    actorRole: "dealer",
    actorDealerId: dealerId,
    targetDealerId: dealerId,
    metadata: {
      themePreset: updated.themePreset,
      hasOverrides: !!updated.themeOverrides,
      hasLogo: !!updated.logoUrl,
    },
  }).catch(() => {});

  return NextResponse.json({ ok: true, ...updated });
}
