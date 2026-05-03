export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripeClient, formatPriceLabel } from "@/lib/stripe";
import { getEffectiveDealerContext } from "@/lib/impersonation";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { effectiveDealerId, isImpersonating } = await getEffectiveDealerContext();
  const dealerId = effectiveDealerId ?? session.user.id;

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: {
      subscriptionStatus: true,
      stripeSubscriptionId: true,
      stripeCustomerId: true,
    },
  });

  if (!dealer) {
    return NextResponse.json({ error: "dealer not found" }, { status: 404 });
  }

  let currentPeriodEnd: string | null = null;
  let priceLabel: string | null = null;

  if (dealer.stripeSubscriptionId) {
    try {
      const subscription = await stripeClient.subscriptions.retrieve(
        dealer.stripeSubscriptionId
      );
      if (subscription.current_period_end) {
        currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();
      }
      const price = subscription.items.data[0]?.price;
      if (price) {
        priceLabel = formatPriceLabel(price);
      }
    } catch {
      // Stripe call failed — return DB-only fields
    }
  }

  return NextResponse.json({
    status: dealer.subscriptionStatus,
    currentPeriodEnd,
    priceLabel,
    hasCustomer: !!dealer.stripeCustomerId,
    isImpersonating,
  });
}
