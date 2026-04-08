import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { cookies } from "next/headers";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripeClient } from "@/lib/stripe";
import { IMPERSONATION_COOKIE, verifyImpersonationToken } from "@/lib/impersonation";

export async function POST() {
  // Block billing actions while impersonating
  const cookieStore = await cookies();
  const impersonationCookie = cookieStore.get(IMPERSONATION_COOKIE);
  if (impersonationCookie?.value) {
    const verified = await verifyImpersonationToken(impersonationCookie.value);
    if (verified) {
      return NextResponse.json(
        { error: "Billing actions are disabled while impersonating a user." },
        { status: 403 }
      );
    }
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
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
