import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { stripeClient } from "@/lib/stripe";

export async function POST() {
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
    return_url: `${process.env.NEXTAUTH_URL}/dashboard`,
  });

  return NextResponse.json({ url: portalSession.url });
}
