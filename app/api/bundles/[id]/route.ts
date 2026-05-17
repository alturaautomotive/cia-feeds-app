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
 * PATCH /api/bundles/[id]
 * Body: { name?, slug?, description?, addSubAccountIds?, removeSubAccountIds? }
 *
 * Rename, retag, or change membership of an existing bundle.
 *  - addSubAccountIds: must currently be standalone (bundleId=null)
 *  - removeSubAccountIds: must currently belong to THIS bundle
 *  - changing slug emits a URL change for every member (rename pipeline)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dealerId = await getEffectiveDealerId();
  if (!dealerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: bundleId } = await params;
  const existing = await prisma.storefrontBundle.findFirst({
    where: { id: bundleId, dealerId },
    include: { subAccounts: { select: { id: true } } },
  });
  if (!existing) return NextResponse.json({ error: "bundle_not_found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const updates: { name?: string; slug?: string; description?: string | null } = {};

  if (typeof body.name === "string") {
    const trimmed = body.name.trim();
    if (!trimmed || trimmed.length > 60) {
      return NextResponse.json({ error: "invalid_name" }, { status: 400 });
    }
    updates.name = trimmed;
  }
  if (typeof body.description === "string" || body.description === null) {
    updates.description =
      typeof body.description === "string" && body.description.trim().length > 0
        ? body.description.trim()
        : null;
  }
  const previousSlug = existing.slug;
  if (typeof body.slug === "string" && body.slug.trim().length > 0) {
    const next = body.slug.trim().toLowerCase();
    if (!isValidBundleSlug(next)) {
      return NextResponse.json(
        {
          error: "invalid_slug",
          detail: RESERVED_BUNDLE_SLUGS.has(next)
            ? `Slug "${next}" is reserved.`
            : "Slug must be lowercase letters, digits, and hyphens, 2-50 chars.",
        },
        { status: 400 }
      );
    }
    if (next !== existing.slug) {
      const conflict = await prisma.storefrontBundle.findFirst({
        where: { dealerId, slug: next, NOT: { id: bundleId } },
        select: { id: true },
      });
      if (conflict) return NextResponse.json({ error: "slug_taken" }, { status: 409 });
      updates.slug = next;
    }
  } else if (body.name && !body.slug) {
    // Auto-update slug only when user changed the name and didn't provide a slug
    const derived = slugify(updates.name ?? existing.name);
    if (derived !== existing.slug && isValidBundleSlug(derived)) {
      const conflict = await prisma.storefrontBundle.findFirst({
        where: { dealerId, slug: derived, NOT: { id: bundleId } },
        select: { id: true },
      });
      if (!conflict) updates.slug = derived;
    }
  }

  const addIds = Array.isArray(body.addSubAccountIds)
    ? (body.addSubAccountIds as unknown[]).filter((x): x is string => typeof x === "string")
    : [];
  const removeIds = Array.isArray(body.removeSubAccountIds)
    ? (body.removeSubAccountIds as unknown[]).filter((x): x is string => typeof x === "string")
    : [];

  // Resolve current members for the post-update audit comparison.
  const currentMemberIds = new Set(existing.subAccounts.map((s) => s.id));

  if (addIds.length > 0) {
    const candidates = await prisma.subAccount.findMany({
      where: { id: { in: addIds }, dealerId },
      select: { id: true, name: true, bundleId: true },
    });
    if (candidates.length !== addIds.length) {
      return NextResponse.json({ error: "sub_account_not_found" }, { status: 404 });
    }
    const alreadyBundled = candidates.filter(
      (s) => s.bundleId != null && s.bundleId !== bundleId
    );
    if (alreadyBundled.length > 0) {
      return NextResponse.json(
        {
          error: "sub_account_already_bundled",
          detail: `${alreadyBundled.map((s) => s.name).join(", ")} belong to another bundle.`,
        },
        { status: 409 }
      );
    }
  }
  if (removeIds.length > 0) {
    const notMembers = removeIds.filter((id) => !currentMemberIds.has(id));
    if (notMembers.length > 0) {
      return NextResponse.json({ error: "sub_account_not_in_bundle" }, { status: 400 });
    }
  }

  await prisma.$transaction(async (tx) => {
    if (Object.keys(updates).length > 0) {
      await tx.storefrontBundle.update({ where: { id: bundleId }, data: updates });
    }
    if (addIds.length > 0) {
      await tx.subAccount.updateMany({
        where: { id: { in: addIds }, dealerId },
        data: { bundleId },
      });
    }
    if (removeIds.length > 0) {
      await tx.subAccount.updateMany({
        where: { id: { in: removeIds }, dealerId, bundleId },
        data: { bundleId: null },
      });
    }
  });

  // URL change pipeline:
  //  - Added subs: previousBundleSlug = null
  //  - Removed subs: previousBundleSlug = the bundle's OLD slug (before update)
  //  - Rename (slug changed) without membership change: every existing
  //    member had previousBundleSlug = old slug, now has new slug.
  const slugChanged = !!(updates.slug && updates.slug !== previousSlug);
  const renameChanges = slugChanged
    ? Array.from(currentMemberIds)
        .filter((id) => !removeIds.includes(id))
        .map((id) => ({ subAccountId: id, previousBundleSlug: previousSlug }))
    : [];
  const addChanges = addIds.map((id) => ({
    subAccountId: id,
    previousBundleSlug: null,
  }));
  const removeChanges = removeIds.map((id) => ({
    subAccountId: id,
    previousBundleSlug: previousSlug,
  }));

  // Use the most specific reason for the dominant operation.
  const reason = slugChanged
    ? "bundle_renamed"
    : addIds.length > 0
    ? "bundle_added"
    : removeIds.length > 0
    ? "bundle_removed"
    : "bundle_renamed"; // no-op

  await emitUrlChangesForSubAccounts({
    dealerId,
    reason,
    changes: [...renameChanges, ...addChanges, ...removeChanges],
  });

  const refreshed = await prisma.storefrontBundle.findUnique({
    where: { id: bundleId },
    include: {
      subAccounts: { select: { id: true, name: true, vertical: true } },
    },
  });

  return NextResponse.json({ bundle: refreshed });
}

/**
 * DELETE /api/bundles/[id]
 *
 * Dissolve a bundle. All member sub-accounts revert to standalone (their
 * bundleId becomes null \u2014 we rely on the SET NULL ON DELETE FK behaviour
 * but also explicit-clear before delete so the audit pipeline sees them).
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const dealerId = await getEffectiveDealerId();
  if (!dealerId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id: bundleId } = await params;
  const existing = await prisma.storefrontBundle.findFirst({
    where: { id: bundleId, dealerId },
    include: { subAccounts: { select: { id: true } } },
  });
  if (!existing) return NextResponse.json({ error: "bundle_not_found" }, { status: 404 });

  const memberIds = existing.subAccounts.map((s) => s.id);
  const previousSlug = existing.slug;

  await prisma.$transaction(async (tx) => {
    if (memberIds.length > 0) {
      await tx.subAccount.updateMany({
        where: { id: { in: memberIds }, dealerId },
        data: { bundleId: null },
      });
    }
    await tx.storefrontBundle.delete({ where: { id: bundleId } });
  });

  await emitUrlChangesForSubAccounts({
    dealerId,
    reason: "bundle_dissolved",
    changes: memberIds.map((id) => ({
      subAccountId: id,
      previousBundleSlug: previousSlug,
    })),
  });

  return NextResponse.json({ ok: true });
}
