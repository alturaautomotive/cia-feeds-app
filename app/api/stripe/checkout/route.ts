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

  let dealer = await prisma.dealer.findUnique({
    where: { id: session.user.id },
    select: { stripeCustomerId: true, name: true, email: true },
  });

  if (!dealer) {
    return NextResponse.json({ error: "dealer not found" }, { status: 404 });
  }

  if (!dealer.stripeCustomerId) {
    const customer = await stripeClient.customers.create({
      email: dealer.email,
      name: dealer.name,
    });
    await prisma.dealer.update({
      where: { id: session.user.id },
      data: { stripeCustomerId: customer.id },
    });
    dealer = { ...dealer, stripeCustomerId: customer.id };
  }

  const checkoutSession = await stripeClient.checkout.sessions.create({
    mode: "subscription",
    customer: dealer.stripeCustomerId!,
    line_items: [{ price: process.env.STRIPE_PRICE_ID!, quantity: 1 }],
    success_url: `${process.env.NEXTAUTH_URL}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.NEXTAUTH_URL}/subscribe?canceled=true`,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
