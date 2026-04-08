import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripeClient } from "@/lib/stripe";
import { getEffectiveDealerContext, IMPERSONATION_COOKIE } from "@/lib/impersonation";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Block billing only when admin is actively impersonating
  const { isImpersonating, hasStaleImpersonationCookie } =
    await getEffectiveDealerContext();

  if (isImpersonating) {
    return NextResponse.json(
      { error: "Billing actions are disabled while impersonating a user." },
      { status: 403 }
    );
  }

  // Clear stale impersonation cookie for non-admin sessions
  if (hasStaleImpersonationCookie) {
    const cookieStore = await cookies();
    cookieStore.delete(IMPERSONATION_COOKIE);
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true },
  });

  if (!dealer?.stripeCustomerId) {
    return NextResponse.json({ error: "no_customer" }, { status: 400 });
  }

  const portalSession = await stripeClient.billingPortal.sessions.create({
    customer: dealer.stripeCustomerId,
    return_url: `${(process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')}/dashboard`,
  });

  return NextResponse.json({ url: portalSession.url });
}
