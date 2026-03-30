import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripeClient } from "@/lib/stripe";
import { checkSubscription } from "@/lib/checkSubscription";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  // Post-checkout reconciliation: if Stripe redirected here with a session_id,
  // persist the subscription before the layout's checkSubscription runs on the
  // next request (webhooks may not have arrived yet).
  const { session_id } = await searchParams;
  if (session_id) {
    try {
      const checkoutSession = await stripeClient.checkout.sessions.retrieve(
        session_id,
        { expand: ["subscription"] }
      );

      // Verify the Checkout Session belongs to the logged-in dealer's customer.
      const dealer = await prisma.dealer.findUnique({
        where: { id: session.user.id },
        select: { stripeCustomerId: true },
      });

      if (
        dealer?.stripeCustomerId &&
        checkoutSession.customer === dealer.stripeCustomerId &&
        checkoutSession.subscription
      ) {
        const subscription =
          typeof checkoutSession.subscription === "string"
            ? await stripeClient.subscriptions.retrieve(
                checkoutSession.subscription
              )
            : checkoutSession.subscription;

        await prisma.dealer.update({
          where: { id: session.user.id },
          data: {
            subscriptionStatus: subscription.status,
            stripeSubscriptionId: subscription.id,
          },
        });
      }
    } catch {
      // Non-fatal: webhook will eventually sync the subscription state.
    }
  }

  const isSubscribed = await checkSubscription(session.user.id);
  if (!isSubscribed) {
    redirect("/subscribe");
  }

  const vehicles = await prisma.vehicle.findMany({
    where: { dealerId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <DashboardClient
      vehicles={vehicles}
      dealerName={session.user.name ?? "Dealer"}
    />
  );
}
