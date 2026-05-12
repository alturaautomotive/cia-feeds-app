import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { criticalDurableRateLimit } from "@/lib/rateLimit";
import { writeAuditLog } from "@/lib/adminAudit";

/**
 * Account deletion endpoints (SECURITY_AUDIT.md F-8.3 \u2014 GDPR Article 17).
 *
 * POST   /api/dealer/me/delete       \u2014 soft-delete: sets deletedAt = now().
 *                                       Dealer immediately can't log in;
 *                                       all data preserved in a 30-day grace
 *                                       window for restore. After 30 days,
 *                                       the data-retention cron hard-deletes.
 * DELETE /api/dealer/me/delete       \u2014 undo: clears deletedAt before grace
 *                                       window expires.
 */

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dealerId = await getEffectiveDealerId();
  if (!dealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ip = (request.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
  // Conservative rate limit: account deletion shouldn't happen often, and
  // ratelimiting protects against an attacker hijacking a session to nuke an
  // account multiple times.
  const rl = await criticalDurableRateLimit(`delete:${dealerId}:${ip}`, 3, 60 * 60_000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: rl.retryAfterMs },
      { status: 429 }
    );
  }

  // Optional confirmation field to reduce accident-induced churn.
  let body: { confirm?: string } = {};
  try {
    body = (await request.json()) as { confirm?: string };
  } catch {
    /* allow empty body */
  }
  if (body.confirm !== "DELETE") {
    return NextResponse.json(
      { error: "confirmation_required", hint: "POST body must include {\"confirm\":\"DELETE\"}" },
      { status: 400 }
    );
  }

  const result = await prisma.dealer.update({
    where: { id: dealerId },
    data: { deletedAt: new Date(), active: false },
    select: { id: true, deletedAt: true },
  });

  await writeAuditLog({
    action: "dealer.account.delete_requested",
    actorEmail: session.user.email ?? "unknown",
    actorRole: "dealer",
    actorDealerId: dealerId,
    targetDealerId: dealerId,
    metadata: { gracePeriodDays: 30 },
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    deletedAt: result.deletedAt,
    gracePeriodDays: 30,
    note: "Account is scheduled for permanent deletion in 30 days. POST DELETE /api/dealer/me/delete before then to cancel.",
  });
}

/**
 * Undo soft-delete during grace window.
 */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dealerId = await getEffectiveDealerId();
  if (!dealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await prisma.dealer.update({
    where: { id: dealerId },
    data: { deletedAt: null, active: true },
  });

  await writeAuditLog({
    action: "dealer.account.delete_cancelled",
    actorEmail: session.user.email ?? "unknown",
    actorRole: "dealer",
    actorDealerId: dealerId,
    targetDealerId: dealerId,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
