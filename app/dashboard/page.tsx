import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripeClient } from "@/lib/stripe";
import { checkSubscription } from "@/lib/checkSubscription";
import { verifyImpersonationToken, IMPERSONATION_COOKIE } from "@/lib/impersonation";
import { DashboardClient } from "./DashboardClient";

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? "").toLowerCase();

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; impersonate?: string }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const isAdmin =
    !!ADMIN_EMAIL &&
    session.user.email?.toLowerCase() === ADMIN_EMAIL;

  // Handle incoming impersonation token — set cookie and redirect to clean URL
  const { impersonate } = await searchParams;
  if (impersonate && isAdmin) {
    const impersonatedDealerId = await verifyImpersonationToken(impersonate);
    if (impersonatedDealerId) {
      const cookieStore = await cookies();
      // Store the signed JWT token in the cookie, not the raw dealerId
      cookieStore.set(IMPERSONATION_COOKIE, impersonate, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        maxAge: 3600,
        path: "/",
      });
      redirect("/dashboard");
    }
    // Invalid token — just continue with normal dashboard
  }

  // Check for active impersonation cookie — only admins may use impersonation
  const cookieStore = await cookies();
  const impersonationCookie = cookieStore.get(IMPERSONATION_COOKIE);
  let impersonatedDealerId: string | null = null;

  if (impersonationCookie?.value) {
    if (!isAdmin) {
      // Non-admin has an impersonation cookie — clear it
      cookieStore.delete(IMPERSONATION_COOKIE);
    } else {
      // Verify the signed token
      impersonatedDealerId = await verifyImpersonationToken(
        impersonationCookie.value
      );
      if (!impersonatedDealerId) {
        // Invalid or expired token — clear the cookie
        cookieStore.delete(IMPERSONATION_COOKIE);
      }
    }
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

  // The effective dealerId — impersonated dealer takes precedence
  const effectiveDealerId = impersonatedDealerId ?? session.user.id;
  const isImpersonating = !!impersonatedDealerId;

  // Skip subscription check when impersonating
  if (!isImpersonating) {
    let isSubscribed = false;
    try {
      isSubscribed = await checkSubscription(session.user.id);
    } catch {
      // Default to false on any DB/network error; redirect will handle it.
    }

    if (!isSubscribed) {
      redirect("/subscribe");
    }
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: effectiveDealerId },
    select: { vertical: true, name: true, slug: true },
  });

  const vertical = dealer?.vertical ?? "automotive";
  const impersonatedDealerName = isImpersonating
    ? dealer?.name ?? "Unknown Dealer"
    : "";
  const impersonatedDealerSlug = isImpersonating
    ? dealer?.slug ?? ""
    : "";

  if (vertical === "automotive") {
    const vehicles = await prisma.vehicle.findMany({
      where: { dealerId: effectiveDealerId, archivedAt: null },
      orderBy: { createdAt: "desc" },
    });

    return (
      <DashboardClient
        vehicles={vehicles}
        listings={[]}
        dealerName={dealer?.name ?? session.user.name ?? "Dealer"}
        vertical={vertical}
        isImpersonating={isImpersonating}
        impersonatedDealerName={impersonatedDealerName}
        impersonatedDealerSlug={impersonatedDealerSlug}
      />
    );
  }

  // Non-automotive verticals use listings
  const listings = await prisma.listing.findMany({
    where: {
      dealerId: effectiveDealerId,
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
      isImpersonating={isImpersonating}
      impersonatedDealerName={impersonatedDealerName}
      impersonatedDealerSlug={impersonatedDealerSlug}
    />
  );
}
