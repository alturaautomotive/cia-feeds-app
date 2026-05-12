export const maxDuration = 120;
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * Weekly data-retention cron (SECURITY_AUDIT.md F-8.2).
 *
 * Implements our published retention policy:
 *
 *   - OAuthState         : delete after 7 days (originally 10-min TTL but
 *                          opportunistic cleanup leaves stragglers).
 *   - PasswordResetToken : delete after 30 days expired.
 *   - RateLimitBucket    : delete buckets idle > 1 day (they auto-expire
 *                          functionally, but the rows linger).
 *   - CrawlSnapshot      : delete snapshots > 365 days old (the 4,834-row
 *                          hot table is the main retention target).
 *   - StripeWebhookEvent : delete > 365 days old (kept only for idempotency
 *                          window; Stripe never retries past a day, but we
 *                          keep a year for audit forensics).
 *   - AdminAuditLog      : kept indefinitely (regulatory).
 *   - Dealer w/ deletedAt: hard-delete after 30 days (F-8.3 grace period).
 *
 * Auth: standard CRON_SECRET bearer.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const days = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

  // Most cleanups are simple deleteMany — but the Dealer hard-delete is more
  // sensitive, so we do it last after gathering counts.
  const [oauthState, passwordTokens, rateLimitBuckets, crawlSnapshots, stripeEvents] =
    await Promise.all([
      prisma.oAuthState.deleteMany({ where: { expiresAt: { lt: days(7) } } }),
      prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lt: days(30) } } }),
      prisma.rateLimitBucket.deleteMany({ where: { windowStart: { lt: days(1) } } }),
      // CrawlSnapshot has no createdAt — use parent crawl job startedAt
      // as the retention pivot (snapshots are immutable, so this is fine).
      prisma.crawlSnapshot.deleteMany({
        where: { crawlJob: { startedAt: { lt: days(365) } } },
      }),
      // StripeWebhookEvent uses processedAt, not receivedAt.
      prisma.stripeWebhookEvent.deleteMany({ where: { processedAt: { lt: days(365) } } }),
    ]);

  // GDPR grace-period hard-delete (F-8.3).
  const expiredDealers = await prisma.dealer.findMany({
    where: { deletedAt: { lt: days(30) } },
    select: { id: true, email: true },
  });

  let hardDeleted = 0;
  for (const d of expiredDealers) {
    try {
      await hardDeleteDealer(d.id);
      hardDeleted++;
    } catch (err) {
      console.error({
        event: "data_retention_hard_delete_failed",
        dealerId: d.id,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    deleted: {
      oauthState: oauthState.count,
      passwordTokens: passwordTokens.count,
      rateLimitBuckets: rateLimitBuckets.count,
      crawlSnapshots: crawlSnapshots.count,
      stripeEvents: stripeEvents.count,
      dealers: hardDeleted,
    },
  });
}

/**
 * Hard-delete a dealer and all their owned data.
 *
 * Relies on Prisma's onDelete: Cascade for child models (Vehicle, Listing,
 * CrawlJob, CrawlSnapshot, Lead, SubAccount, TeamUser, MetaCatalogSyncItem,
 * MetaDeliveryJob). Storage objects under their dealer-id folder are also
 * removed best-effort.
 */
async function hardDeleteDealer(dealerId: string): Promise<void> {
  // 1. Delete files in storage (best-effort).
  try {
    const { data: files } = await supabaseAdmin.storage
      .from("vehicle-images")
      .list(`${dealerId}/`, { limit: 1000 });
    if (files && files.length > 0) {
      await supabaseAdmin.storage
        .from("vehicle-images")
        .remove(files.map((f) => `${dealerId}/${f.name}`));
    }
    // Also check listings/profiles folders for files keyed on the dealerId.
    for (const folder of ["listings", "profiles"]) {
      const { data: subFiles } = await supabaseAdmin.storage
        .from("vehicle-images")
        .list(folder, { limit: 1000, search: dealerId });
      if (subFiles && subFiles.length > 0) {
        await supabaseAdmin.storage
          .from("vehicle-images")
          .remove(subFiles.map((f) => `${folder}/${f.name}`));
      }
    }
  } catch (err) {
    console.warn({
      event: "data_retention_storage_cleanup_failed",
      dealerId,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  // 2. Delete the dealer row. Cascades wipe owned rows.
  await prisma.dealer.delete({ where: { id: dealerId } });
}
