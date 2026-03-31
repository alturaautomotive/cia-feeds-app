import Stripe from "stripe";

const globalForStripe = globalThis as unknown as {
  stripeClient: Stripe | undefined;
};

export const stripeClient =
  globalForStripe.stripeClient ??
  new Stripe(process.env.STRIPE_SECRET_KEY!, {
          apiVersion: "2025-02-24.acacia",
  });

if (process.env.NODE_ENV !== "production") globalForStripe.stripeClient = stripeClient;
