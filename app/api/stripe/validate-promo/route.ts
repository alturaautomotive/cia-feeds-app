import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { stripeClient } from "@/lib/stripe";
import { criticalDurableRateLimit } from "@/lib/rateLimit";

/**
 * POST /api/stripe/validate-promo — Validates a Stripe promo code.
 *
 * Security (SECURITY_AUDIT.md F-4.3):
 *   - Requires an authenticated session (any logged-in dealer can validate).
 *   - Fail-closed rate limited per-(IP, user) to stop promo-code enumeration:
 *     5 attempts / 60 seconds per pair, 30 / 60s per IP.
 *
 * Without these guards, an unauthenticated attacker could enumerate active
 * promo codes by spamming POSTs (Stripe's promotionCodes.list returns
 * enough metadata to differentiate valid codes).
 */
export async function POST(request: Request) {
  // 1. Require login.
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 2. Rate limit (fail closed on DB errors).
  const ip = (request.headers.get("x-forwarded-for") ?? "unknown")
    .split(",")[0]
    .trim();
  const userKey = session.user.id;

  const perPair = await criticalDurableRateLimit(
    `promo:${ip}:${userKey}`,
    5,
    60_000
  );
  if (!perPair.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: perPair.retryAfterMs },
      { status: 429 }
    );
  }

  const perIp = await criticalDurableRateLimit(`promo_ip:${ip}`, 30, 60_000);
  if (!perIp.allowed) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterMs: perIp.retryAfterMs },
      { status: 429 }
    );
  }

  // 3. Parse + validate body.
  const body = await request.json().catch(() => ({}));
  const { code } = body as { code?: string };

  if (!code || !code.trim()) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  // Cap code length to prevent absurd Stripe API calls.
  if (code.length > 64) {
    return NextResponse.json({ error: "code too long" }, { status: 400 });
  }

  const result = await stripeClient.promotionCodes.list({
    code: code.trim(),
    active: true,
    limit: 1,
  });

  if (result.data.length === 0) {
    return NextResponse.json(
      { error: "Invalid or expired promo code" },
      { status: 400 }
    );
  }

  const promoCode = result.data[0];
  const coupon = promoCode.coupon;

  let label = "Discount applied";
  if (coupon.percent_off != null) {
    label = `${coupon.percent_off}% off`;
  } else if (coupon.amount_off != null) {
    const amount = (coupon.amount_off / 100).toFixed(2).replace(/\.00$/, "");
    const currency = (coupon.currency ?? "usd").toUpperCase();
    const symbol = currency === "USD" ? "$" : currency + " ";
    label = `${symbol}${amount} off`;
  }

  return NextResponse.json({ promotionCodeId: promoCode.id, label });
}
