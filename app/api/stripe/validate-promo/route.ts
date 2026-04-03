import { NextResponse } from "next/server";
import { stripeClient } from "@/lib/stripe";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { code } = body as { code?: string };

  if (!code || !code.trim()) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
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
