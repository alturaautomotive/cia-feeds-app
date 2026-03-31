import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripeClient } from "@/lib/stripe";

export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get("secret");
  if (secret !== process.env.SYNC_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const email = request.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  try {
    // Find Stripe customer by email
    const customers = await stripeClient.customers.list({ email, limit: 1 });
    if (customers.data.length === 0) {
      return NextResponse.json({ error: "no stripe customer found for this email" }, { status: 404 });
    }

    const customer = customers.data[0];

    // Get their active subscription
    const subscriptions = await stripeClient.subscriptions.list({
      customer: customer.id,
      status: "active",
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      return NextResponse.json({ error: "no active subscription found" }, { status: 404 });
    }

    const subscription = subscriptions.data[0];

    // Write back to database
    const result = await prisma.dealer.updateMany({
      where: { email },
      data: {
        stripeCustomerId: customer.id,
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
      },
    });

    return NextResponse.json({
      success: true,
      updated: result.count,
      customerId: customer.id,
      subscriptionId: subscription.id,
      status: subscription.status,
    });
  } catch (err) {
    console.error("[sync-subscription] Error:", err);
    return NextResponse.json({ error: "sync failed", detail: String(err) }, { status: 500 });
  }
}
