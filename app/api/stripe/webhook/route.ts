export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { stripeClient } from "@/lib/stripe";
import type Stripe from "stripe";
import {
  logStripeWebhookReceived,
  logStripeWebhookProcessed,
  logStripeWebhookError,
} from "@/lib/logger";

async function applySubscriptionStatus(
  eventId: string,
  eventType: string,
  stripeCustomerId: string,
  status: string,
  subscriptionId?: string,
) {
  const dealer = await prisma.dealer.findFirst({
    where: { stripeCustomerId },
    select: { id: true, metaDeliveryMethod: true },
  });

  if (!dealer) {
    console.log({ event: "stripe_webhook_dealer_not_found", stripeCustomerId, eventId });
    return;
  }

  const updateData: Record<string, unknown> = { subscriptionStatus: status };
  if (subscriptionId) {
    updateData.stripeSubscriptionId = subscriptionId;
  }
  if (status === "canceled" || status === "unpaid") {
    updateData.metaDeliveryMethod = "csv";
  }

  await prisma.$transaction([
    prisma.dealer.update({
      where: { id: dealer.id },
      data: updateData,
    }),
    prisma.stripeWebhookEvent.create({
      data: { id: eventId, type: eventType },
    }),
  ]);
}

export async function POST(request: Request) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = stripeClient.webhooks.constructEvent(
      body,
      sig!,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch {
    return new Response("Webhook signature verification failed", { status: 400 });
  }

  logStripeWebhookReceived({ eventId: event.id, type: event.type });

  // Idempotency check
  const existing = await prisma.stripeWebhookEvent.findUnique({
    where: { id: event.id },
  });
  if (existing) {
    return NextResponse.json({ received: true, idempotent: true });
  }

  const start = Date.now();

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.resumed": {
        const subscription = event.data.object as Stripe.Subscription;
        await applySubscriptionStatus(
          event.id,
          event.type,
          subscription.customer as string,
          subscription.status,
          subscription.id,
        );
        break;
      }
      case "customer.subscription.paused": {
        const subscription = event.data.object as Stripe.Subscription;
        await applySubscriptionStatus(
          event.id,
          event.type,
          subscription.customer as string,
          subscription.status,
          subscription.id,
        );
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        await applySubscriptionStatus(
          event.id,
          event.type,
          subscription.customer as string,
          "canceled",
        );
        break;
      }
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        await applySubscriptionStatus(
          event.id,
          event.type,
          invoice.customer as string,
          "past_due",
        );
        break;
      }
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        if (invoice.subscription) {
          const subscription = await stripeClient.subscriptions.retrieve(
            invoice.subscription as string
          );
          await applySubscriptionStatus(
            event.id,
            event.type,
            invoice.customer as string,
            subscription.status,
            subscription.id,
          );
        } else {
          // One-off invoice, just record idempotency
          await prisma.stripeWebhookEvent.create({
            data: { id: event.id, type: event.type },
          });
        }
        break;
      }
      case "customer.subscription.trial_will_end": {
        const subscription = event.data.object as Stripe.Subscription;
        // Log-only; no DB mutation needed
        await prisma.stripeWebhookEvent.create({
          data: { id: event.id, type: event.type },
        });
        logStripeWebhookProcessed({
          eventId: event.id,
          type: event.type,
          durationMs: Date.now() - start,
          trialEnd: subscription.trial_end,
        });
        return NextResponse.json({ received: true });
      }
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.customer && session.subscription) {
          const subscription = await stripeClient.subscriptions.retrieve(
            session.subscription as string
          );
          await applySubscriptionStatus(
            event.id,
            event.type,
            session.customer as string,
            subscription.status,
            subscription.id,
          );
        } else {
          await prisma.stripeWebhookEvent.create({
            data: { id: event.id, type: event.type },
          });
        }
        break;
      }
      default: {
        // Unhandled event type — record for idempotency but take no action
        await prisma.stripeWebhookEvent.create({
          data: { id: event.id, type: event.type },
        });
        break;
      }
    }

    logStripeWebhookProcessed({
      eventId: event.id,
      type: event.type,
      durationMs: Date.now() - start,
    });
  } catch (err) {
    logStripeWebhookError({
      eventId: event.id,
      type: event.type,
      errorMessage: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({ received: true });
}
