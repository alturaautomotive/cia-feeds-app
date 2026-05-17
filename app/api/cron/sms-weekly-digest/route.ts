/**
 * Weekly SMS metrics digest cron.
 *
 * Schedule: Mondays at 14:00 UTC (~9-10 AM Eastern), per CTIA best
 * practice of sending B2B messages during business hours in the
 * recipient's local zone.
 *
 * Walks every SmsConversation that:
 *   - has a dealerId
 *   - is opted in for proactive
 *   - has notificationPrefs.weeklyDigest = true
 *   - is not opted out
 *
 * Composes a per-dealer digest via buildWeeklyDigest() and sends. Per-
 * dealer failures are caught and logged; the cron always returns 200
 * with a summary so Vercel doesn't retry the whole run.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildWeeklyDigest, sendProactiveSms } from "@/lib/smsNotifications";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const provided =
      request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      request.headers.get("x-cron-secret");
    if (provided !== secret) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  // Use raw SQL JSON predicate so we don't accidentally page through
  // every conversation just to filter in app code.
  const conversations = await prisma.smsConversation.findMany({
    where: {
      dealerId: { not: null },
      optedInProactiveAt: { not: null },
      optedOutAt: null,
    },
    select: {
      id: true,
      dealerId: true,
      notificationPrefs: true,
    },
  });

  const results: Array<{ dealerId: string; sent: boolean; reason?: string }> = [];

  for (const c of conversations) {
    if (!c.dealerId) continue;
    const prefs = (c.notificationPrefs as Record<string, boolean>) ?? {};
    if (!prefs.weeklyDigest) {
      results.push({ dealerId: c.dealerId, sent: false, reason: "weeklyDigest_disabled" });
      continue;
    }
    try {
      const body = await buildWeeklyDigest(c.dealerId);
      if (!body) {
        results.push({ dealerId: c.dealerId, sent: false, reason: "no_body" });
        continue;
      }
      const r = await sendProactiveSms(c.dealerId, "weeklyDigest", body);
      results.push({ dealerId: c.dealerId, ...r });
    } catch (err) {
      results.push({
        dealerId: c.dealerId,
        sent: false,
        reason: err instanceof Error ? err.message : "error",
      });
    }
  }

  const sent = results.filter((r) => r.sent).length;
  const skipped = results.length - sent;

  return NextResponse.json({
    ranAt: new Date().toISOString(),
    eligible: conversations.length,
    sent,
    skipped,
    perDealer: results,
  });
}
