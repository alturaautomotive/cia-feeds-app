/**
 * Manual audience refresh trigger from the dealer dashboard.
 *
 * Same work as the daily cron at /api/cron/refresh-meta-audiences, but
 * scoped to a single dealer (the caller's effective dealer) and gated
 * on session auth instead of CRON_SECRET.
 */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getEffectiveDealerContext } from "@/lib/impersonation";
import { refreshDealerAudiences } from "@/lib/metaAudiences";

export const maxDuration = 60;

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ctx = await getEffectiveDealerContext();
  if (!ctx.effectiveDealerId) {
    return NextResponse.json({ error: "no_dealer" }, { status: 403 });
  }

  try {
    const summary = await refreshDealerAudiences(ctx.effectiveDealerId);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : "refresh_failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
