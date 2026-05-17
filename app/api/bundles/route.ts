import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveDealerId } from "@/lib/impersonation";
import {
  isValidBundleSlug,
  slugify,
  RESERVED_BUNDLE_SLUGS,
} from "@/lib/storefront";
import { emitUrlChangesForSubAccounts } from "@/lib/urlChangePipeline";

export const dynamic = "force-dynamic";

/**
 * GET /api/bundles
 *
 * Returns the dealer's bundles with each bundle's member sub-accounts.
 * Used by the dashboard "Storefront" panel under Profile.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dealerId = await getEffectiveDealerId();
  if (!dealerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const bundles = await prisma.storefrontBundle.findMany({
    where: { dealerId },
    orderBy: { createdAt: "asc" },
    include: {
      subAccounts: {
        select: { id: true, name: true, vertical: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  return NextResponse.json({ bundles });
}

/**
 * POST /api/bundles
 * Body: { name: string, slug?: string, description?: string|null, subAccountIds: string[] }
 *
 * Create a new bundle and assign sub-accounts to it. Rules:
 *  - Need >= 2 sub-account members (bundling 1 is just standalone).
 *  - A sub-account can only belong to one bundle \u2014 we reject any that
 *    are already bundled.
 *  - Slug auto-derived from name when not provided. Cannot collide with a
 *    reserved segment slug (e.g. "vehicles", "homes").
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dealerId = await getEffectiveDealerId();
  if (!dealerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { name?: unknown; slug?: unknown; description?: unknown; subAccountIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : null;
  const rawSlug =
    typeof body.slug === "string" && body.slug.trim().length > 0
      ? body.slug.trim().toLowerCase()
      : slugify(name);
  const subAccountIds = Array.isArray(body.subAccountIds)
    ? (body.subAccountIds.filter((x): x is string => typeof x === "string"))
    : [];

  if (!name || name.length > 60) {
    return NextResponse.json({ error: "invalid_name" }, { status: 400 });
  }
  if (!isValidBundleSlug(rawSlug)) {
    return NextResponse.json(
      {
        error: "invalid_slug",
        detail: RESERVED_BUNDLE_SLUGS.has(rawSlug)
          ? `Slug "${rawSlug}" is reserved.`
          : "Slug must be lowercase letters, digits, and hyphens, 2-50 chars.",
      },
      { status: 400 }
    );
  }
  if (subAccountIds.length < 2) {
    return NextResponse.json({ error: "needs_at_least_two_subaccounts" }, { status: 400 });
  }

  // Verify all sub-accounts belong to this dealer AND are not already
  // bundled. Block in one query to avoid TOCTOU.
  const subs = await prisma.subAccount.findMany({
    where: { id: { in: subAccountIds }, dealerId },
    select: { id: true, name: true, bundleId: true },
  });
  if (subs.length !== subAccountIds.length) {
    return NextResponse.json({ error: "sub_account_not_found" }, { status: 404 });
  }
  const alreadyBundled = subs.filter((s) => s.bundleId != null);
  if (alreadyBundled.length > 0) {
    return NextResponse.json(
      {
        error: "sub_account_already_bundled",
        detail: `${alreadyBundled.map((s) => s.name).join(", ")} already belong to another bundle. Remove them first.`,
      },
      { status: 409 }
    );
  }

  // Slug uniqueness scoped to the dealer.
  const existing = await prisma.storefrontBundle.findFirst({
    where: { dealerId, slug: rawSlug },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ error: "slug_taken" }, { status: 409 });
  }

  const bundle = await prisma.$transaction(async (tx) => {
    const b = await tx.storefrontBundle.create({
      data: {
        dealerId,
        slug: rawSlug,
        name,
        description: description || null,
      },
    });
    await tx.subAccount.updateMany({
      where: { id: { in: subAccountIds }, dealerId },
      data: { bundleId: b.id },
    });
    return b;
  });

  // URL-change pipeline: every sub-account in the new bundle had its
  // public URL change from /<vertical-slug> to /<bundle-slug>.
  await emitUrlChangesForSubAccounts({
    dealerId,
    reason: "bundle_added",
    changes: subAccountIds.map((id) => ({ subAccountId: id, previousBundleSlug: null })),
  });

  return NextResponse.json({ bundle }, { status: 201 });
}
