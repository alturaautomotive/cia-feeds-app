import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripeClient } from "@/lib/stripe";
import { SubscribeClient } from "./SubscribeClient";

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: session.user.id },
    select: { subscriptionStatus: true },
  });

  if (dealer?.subscriptionStatus === "active") {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const canceled = params.canceled === "true";

  let priceLabel: string | null = null;
  try {
    const price = await stripeClient.prices.retrieve(process.env.STRIPE_PRICE_ID!);
    if (price.unit_amount != null) {
      const amount = (price.unit_amount / 100).toLocaleString("en-US", {
        style: "currency",
        currency: price.currency.toUpperCase(),
        minimumFractionDigits: 0,
      });
      const interval = price.recurring?.interval ?? "month";
      priceLabel = `${amount} / ${interval}`;
    }
  } catch {
    priceLabel = null;
  }

  return <SubscribeClient canceled={canceled} priceLabel={priceLabel} />;
}
