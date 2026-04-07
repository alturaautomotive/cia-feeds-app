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
  try {
    const { session_id } = await searchParams;
    if (session_id) {
      const checkoutSession = await stripeClient.checkout.sessions.retrieve(
        session_id,
        { expand: ["subscription"] }
      );

      // Verify the Checkout Session belongs to the logged-in dealer's customer.
      const dealerForCheckout = await prisma.dealer.findUnique({
        where: { id: session.user.id },
        select: { stripeCustomerId: true },
      });

      if (
        dealerForCheckout?.stripeCustomerId &&
        checkoutSession.customer === dealerForCheckout.stripeCustomerId &&
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
    }
  } catch {
    // Non-fatal: webhook will eventually sync the subscription state.
  }

  let isSubscribed = false;
  try {
    isSubscribed = await checkSubscription(session.user.id);
  } catch {
    // Default to false on any DB/network error; redirect will handle it.
  }

  if (!isSubscribed) {
    redirect("/subscribe");
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: session.user.id },
    select: { vertical: true, name: true },
  });

  const vertical = dealer?.vertical ?? "automotive";

  if (vertical === "automotive") {
    const vehicles = await prisma.vehicle.findMany({
      where: { dealerId: session.user.id, archivedAt: null },
      orderBy: { createdAt: "desc" },
    });

    return (
      <DashboardClient
        vehicles={vehicles}
        listings={[]}
        dealerName={dealer?.name ?? session.user.name ?? "Dealer"}
        vertical={vertical}
      />
    );
  }

  // Non-automotive verticals use listings
  const listings = await prisma.listing.findMany({
    where: {
      dealerId: session.user.id,
      vertical,
      archivedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <DashboardClient
      vehicles={[]}
      listings={JSON.parse(JSON.stringify(listings))}
      dealerName={dealer?.name ?? session.user.name ?? "Dealer"}
      vertical={vertical}
    />
  );
}
