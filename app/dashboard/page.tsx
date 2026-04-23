import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripeClient } from "@/lib/stripe";
import { checkSubscription } from "@/lib/checkSubscription";
import { getEffectiveDealerContext } from "@/lib/impersonation";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string; impersonate?: string; subAccountId?: string }>;
}) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  // If an impersonation token arrives via query param, redirect to the
  // Route Handler that verifies the token and sets the cookie.
  // Cookie mutation is not supported in Server Components.
  const { impersonate } = await searchParams;
  if (impersonate) {
    redirect(`/api/admin/impersonate/activate?token=${encodeURIComponent(impersonate)}`);
  }

  // Read impersonation state (read-only — no cookie mutation in Server Components)
  const { effectiveDealerId: resolvedDealerId, isImpersonating, hasStaleImpersonationCookie } =
    await getEffectiveDealerContext();

  // If a stale impersonation cookie is present (non-admin user or expired token),
  // redirect to the clear endpoint to remove it before proceeding.
  if (hasStaleImpersonationCookie) {
    redirect("/api/admin/impersonate/clear");
  }

  const impersonatedDealerId = isImpersonating ? resolvedDealerId : null;

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
  const effectiveDealerId = resolvedDealerId ?? session.user.id;

  let isSubscribed = false;
  try {
    isSubscribed = await checkSubscription(effectiveDealerId);
  } catch {
    // Default to false on any DB/network error; redirect will handle it.
  }

  if (!isSubscribed) {
    redirect("/subscribe");
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: effectiveDealerId },
    select: { vertical: true, name: true, slug: true, defaultSubAccountId: true, subAccounts: { orderBy: { createdAt: "asc" } } },
  });

  const subAccounts = dealer?.subAccounts ?? [];
  const { subAccountId: requestedSubAccountId } = await searchParams;

  // Scoped access: editors can only view their assigned sub-account
  const tu = session.user.teamUser;
  const editorLockedSubAccountId =
    tu?.role === "editor" && tu.subAccountId ? tu.subAccountId : null;

  const currentSubAccountId = editorLockedSubAccountId
    ? editorLockedSubAccountId
    : requestedSubAccountId && subAccounts.some((s) => s.id === requestedSubAccountId)
      ? requestedSubAccountId
      : dealer?.defaultSubAccountId ?? subAccounts[0]?.id ?? null;

  const currentSubAccount = subAccounts.find((s) => s.id === currentSubAccountId);
  const vertical = currentSubAccount?.vertical ?? dealer?.vertical ?? "automotive";

  const impersonatedDealerName = isImpersonating
    ? dealer?.name ?? "Unknown Dealer"
    : "";
  const impersonatedDealerSlug = isImpersonating
    ? dealer?.slug ?? ""
    : "";

  const subAccountsForClient = subAccounts.map((s) => ({
    id: s.id,
    name: s.name,
    vertical: s.vertical,
  }));

  if (vertical === "automotive") {
    const vehicles = await prisma.vehicle.findMany({
      where: {
        dealerId: effectiveDealerId,
        archivedAt: null,
        ...(currentSubAccountId ? { subAccountId: currentSubAccountId } : {}),
      },
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
        subAccounts={subAccountsForClient}
        currentSubAccountId={currentSubAccountId}
      />
    );
  }

  // Non-automotive verticals use listings
  const listings = await prisma.listing.findMany({
    where: {
      dealerId: effectiveDealerId,
      vertical,
      archivedAt: null,
      ...(currentSubAccountId ? { subAccountId: currentSubAccountId } : {}),
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
      subAccounts={subAccountsForClient}
      currentSubAccountId={currentSubAccountId}
    />
  );
}
