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

export function formatPriceLabel(price: Stripe.Price): string | null {
  if (price.unit_amount == null) return null;
  const amount = (price.unit_amount / 100).toLocaleString("en-US", {
    style: "currency",
    currency: price.currency.toUpperCase(),
    minimumFractionDigits: 0,
  });
  const interval = price.recurring?.interval ?? "month";
  return `${amount} / ${interval}`;
}
