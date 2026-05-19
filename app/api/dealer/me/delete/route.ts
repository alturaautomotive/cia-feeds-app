import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { criticalDurableRateLimit } from "@/lib/rateLimit";
import { suspendDealer, restoreDealer } from "@/lib/accountManagement";

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

  // Delegate to the shared lifecycle helper so self-serve and admin paths
  // behave identically: same audit-log shape, same Stripe-cancel-at-period-end
  // behaviour, same idempotency.
  const result = await suspendDealer({
    dealerId,
    actor: {
      email: session.user.email ?? "unknown",
      role: "dealer",
      actorDealerId: dealerId,
    },
    reason: "self_serve_delete_request",
  });

  return NextResponse.json({
    ok: true,
    deletedAt: result.dealer.deletedAt,
    gracePeriodDays: 30,
    stripe: result.stripe,
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

  await restoreDealer({
    dealerId,
    actor: {
      email: session.user.email ?? "unknown",
      role: "dealer",
      actorDealerId: dealerId,
    },
  });

  return NextResponse.json({ ok: true });
}
