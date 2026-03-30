export function validateEnv() {
  const required = [
    "DATABASE_URL",
    "NEXTAUTH_SECRET",
    "NEXTAUTH_URL",
    "FIRECRAWL_API_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_PRICE_ID",
    "STRIPE_WEBHOOK_SECRET",
  ];

  for (const name of required) {
    if (!process.env[name]) {
      throw new Error(`Missing required env var: ${name}`);
    }
  }
}

validateEnv();
