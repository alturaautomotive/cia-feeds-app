import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripeClient, formatPriceLabel } from "@/lib/stripe";
import { SubscribeClient } from "./SubscribeClient";

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string; success?: string; session_id?: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const params = await searchParams;
  const success = params.success === "true";
  const sessionId = params.session_id ?? null;
  const canceled = params.canceled === "true";

  const dealer = await prisma.dealer.findUnique({
    where: { id: session.user.id },
    select: { subscriptionStatus: true },
  });

  // Only redirect to dashboard if active AND not in the post-checkout success flow
  if (!success && dealer?.subscriptionStatus === "active") {
    redirect("/dashboard");
  }

  let priceLabel: string | null = null;
  try {
    const price = await stripeClient.prices.retrieve(process.env.STRIPE_PRICE_ID!);
    priceLabel = formatPriceLabel(price);
  } catch {
    priceLabel = null;
  }

  return (
    <SubscribeClient
      canceled={canceled}
      priceLabel={priceLabel}
      success={success}
      sessionId={sessionId}
      currentStatus={dealer?.subscriptionStatus ?? null}
    />
  );
}
