/**
 * Cron: refresh Meta Custom Audiences for every dealer with an active
 * Meta integration.
 *
 * Schedule: daily. Audiences are recomputed by Meta continuously on their
 * side once we declare the rule; we just need to (a) create new audiences
 * for newly-published listings and (b) re-push the customer-file audience
 * with the latest lead list. Once per day is sufficient cadence.
 *
 * Dealers without metaPixelId / metaAdAccountId / metaAccessToken are
 * silently skipped (they haven't connected Meta yet).
 *
 * Per-dealer failures are caught + logged + counted; the cron always
 * returns 200 with a summary so Vercel doesn't retry the whole run.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refreshDealerAudiences } from "@/lib/metaAudiences";

export const maxDuration = 300; // up to 5 minutes for a fleet of dealers

export async function GET(request: NextRequest) {
  // Cron auth: CRON_SECRET in Authorization header (Vercel cron) or
  // x-cron-secret header (manual invocation).
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided =
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      request.headers.get("x-cron-secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const dealers = await prisma.dealer.findMany({
    where: {
      deletedAt: null,
      active: true,
      metaPixelId: { not: null },
      metaAdAccountId: { not: null },
      metaAccessToken: { not: null },
    },
    select: { id: true, slug: true },
  });

  const results: Array<{
    slug: string;
    created: number;
    refreshed: number;
    errors: number;
    message?: string;
  }> = [];

  for (const dealer of dealers) {
    try {
      const r = await refreshDealerAudiences(dealer.id);
      results.push({ slug: dealer.slug, ...r });
    } catch (err) {
      results.push({
        slug: dealer.slug,
        created: 0,
        refreshed: 0,
        errors: 1,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const totals = results.reduce(
    (acc, r) => ({
      created: acc.created + r.created,
      refreshed: acc.refreshed + r.refreshed,
      errors: acc.errors + r.errors,
    }),
    { created: 0, refreshed: 0, errors: 0 }
  );

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    dealersProcessed: dealers.length,
    ...totals,
    perDealer: results,
  });
}
