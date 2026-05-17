/**
 * Pipeline that runs whenever a sub-account's storefront URL changes
 * (typically because of a bundle assignment, bundle rename, or removal).
 *
 * What it does:
 *   1. Computes each affected listing/vehicle's old vs new public URL.
 *   2. Writes one StorefrontUrlChange audit row per changed entity.
 *   3. Triggers a Meta catalog feed dispatch so the new URLs propagate to
 *      Meta's deeplinks (otherwise existing ads point to 404 paths).
 *
 * Intentionally does NOT update any `url` columns on Listing/Vehicle rows
 * \u2014 those columns store the *source* URL (the page we scraped from). The
 * public storefront URL is *derived* every time it's emitted into the
 * Meta CSV via lib/storefront.buildListingUrl(). That keeps the pipeline
 * idempotent and avoids races during bundle edits.
 */
import { prisma } from "@/lib/prisma";
import {
  buildListingUrl,
  type StorefrontUrlContext,
  VERTICAL_SEGMENT_SLUGS,
} from "@/lib/storefront";
import type { Vertical } from "@/lib/verticals";
import { dispatchFeedDeliveryInBackground } from "@/lib/metaDelivery";
import { after } from "next/server";

export type UrlChangeReason =
  | "bundle_added"
  | "bundle_removed"
  | "bundle_renamed"
  | "bundle_dissolved"
  | "custom_domain_changed"
  | "slug_changed";

/**
 * Compute the storefront URL a sub-account's inventory would render at given
 * a specific bundle slug (or null for standalone). Used to derive "old" URLs
 * inside the audit pipeline.
 */
function urlForSubAccount(
  ctx: StorefrontUrlContext,
  vertical: Vertical,
  bundleSlug: string | null,
  entityKind: "listing" | "vehicle",
  entityId: string
): string {
  const subStub = bundleSlug
    ? { vertical, bundle: { slug: bundleSlug } }
    : { vertical, bundle: null };
  return buildListingUrl(ctx, subStub, vertical, entityKind, entityId);
}

/**
 * Run the URL-change pipeline for a list of sub-accounts whose storefront
 * URL just changed. Pass the "before" bundle slug for each sub-account so we
 * can compute the old URL accurately; `null` means it was standalone before.
 *
 * Caller is responsible for the sub-account already being in its new state
 * in the DB (we always read the current state to compute the new URL).
 */
export async function emitUrlChangesForSubAccounts(args: {
  dealerId: string;
  reason: UrlChangeReason;
  changes: Array<{ subAccountId: string; previousBundleSlug: string | null }>;
}): Promise<{ rowsLogged: number }> {
  const { dealerId, reason, changes } = args;
  if (changes.length === 0) return { rowsLogged: 0 };

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { slug: true, customDomain: true },
  });
  if (!dealer) return { rowsLogged: 0 };

  const ctx: StorefrontUrlContext = {
    dealerSlug: dealer.slug,
    customDomain: dealer.customDomain,
  };

  let rowsLogged = 0;

  for (const change of changes) {
    const sub = await prisma.subAccount.findUnique({
      where: { id: change.subAccountId },
      select: {
        id: true,
        vertical: true,
        bundle: { select: { slug: true } },
      },
    });
    if (!sub) continue;

    const vertical = sub.vertical as Vertical;
    const newBundleSlug = sub.bundle?.slug ?? null;
    const previousBundleSlug = change.previousBundleSlug;

    // No-op when the bundle assignment didn't actually change (rename of an
    // unrelated bundle, etc.). We still want to emit the audit row when the
    // bundle slug itself changed even though the sub stayed in the same
    // bundle id; callers handle this by computing previousBundleSlug from
    // the bundle's *old* slug, not the assignment-was-the-same heuristic.
    if (newBundleSlug === previousBundleSlug) continue;

    const inventory = await prisma.listing.findMany({
      where: {
        dealerId,
        subAccountId: sub.id,
        archivedAt: null,
      },
      select: { id: true },
    });
    const vehicles = await prisma.vehicle.findMany({
      where: {
        dealerId,
        subAccountId: sub.id,
        archivedAt: null,
      },
      select: { id: true },
    });

    const auditRows: Array<{
      dealerId: string;
      entityType: string;
      entityId: string;
      oldUrl: string;
      newUrl: string;
      reason: string;
    }> = [];

    for (const l of inventory) {
      const oldUrl = urlForSubAccount(
        ctx,
        vertical,
        previousBundleSlug,
        "listing",
        l.id
      );
      const newUrl = urlForSubAccount(ctx, vertical, newBundleSlug, "listing", l.id);
      if (oldUrl !== newUrl) {
        auditRows.push({
          dealerId,
          entityType: "listing",
          entityId: l.id,
          oldUrl,
          newUrl,
          reason,
        });
      }
    }
    for (const v of vehicles) {
      const oldUrl = urlForSubAccount(
        ctx,
        vertical,
        previousBundleSlug,
        "vehicle",
        v.id
      );
      const newUrl = urlForSubAccount(ctx, vertical, newBundleSlug, "vehicle", v.id);
      if (oldUrl !== newUrl) {
        auditRows.push({
          dealerId,
          entityType: "vehicle",
          entityId: v.id,
          oldUrl,
          newUrl,
          reason,
        });
      }
    }

    if (auditRows.length > 0) {
      await prisma.storefrontUrlChange.createMany({ data: auditRows });
      rowsLogged += auditRows.length;
    }
  }

  // Mirror these new URLs to Meta. The dispatcher reads listings + vehicles
  // fresh and re-emits the catalog feed; lib/csv.ts will use the *current*
  // bundle assignment when building the row's `url` column.
  if (rowsLogged > 0) {
    dispatchFeedDeliveryInBackground(dealerId, "bundle_url_change", after);
  }

  return { rowsLogged };
}

// Re-export so callers don't need a second import for the slug map.
export { VERTICAL_SEGMENT_SLUGS };
