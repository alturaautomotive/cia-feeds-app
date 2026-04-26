/**
 * Resolves Meta app credentials with deterministic precedence:
 * FB_APP_ID / FB_APP_SECRET (preferred) → META_APP_ID / META_APP_SECRET (fallback).
 * Throws an actionable error when neither pair is present.
 */
export function resolveMetaAppCredentials(): {
  appId: string;
  appSecret: string;
} {
  const fbId = process.env.FB_APP_ID;
  const fbSecret = process.env.FB_APP_SECRET;
  const metaId = process.env.META_APP_ID;
  const metaSecret = process.env.META_APP_SECRET;

  if (fbId && fbSecret) {
    return { appId: fbId, appSecret: fbSecret };
  }
  if (metaId && metaSecret) {
    return { appId: metaId, appSecret: metaSecret };
  }

  throw new Error(
    "Missing Meta app credentials: set FB_APP_ID + FB_APP_SECRET (preferred) or META_APP_ID + META_APP_SECRET (fallback). Mixed/empty config is not supported."
  );
}

export function validateEnv() {
  const required = [
    "DATABASE_URL",
    "NEXTAUTH_SECRET",
    "NEXTAUTH_URL",
    "NEXT_PUBLIC_APP_URL",
    "FIRECRAWL_API_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_PRICE_ID",
    "STRIPE_WEBHOOK_SECRET",
    "GEMINI_API_KEY",
    "OPENAI_API_KEY",
    "RESEND_API_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "GOOGLE_MAPS_API_KEY",
  ];

  for (const name of required) {
    if (!process.env[name]) {
      throw new Error(`Missing required env var: ${name}`);
    }
  }

  // Validate that at least one complete Meta credential pair exists
  const hasFb = process.env.FB_APP_ID && process.env.FB_APP_SECRET;
  const hasMeta = process.env.META_APP_ID && process.env.META_APP_SECRET;
  if (!hasFb && !hasMeta) {
    throw new Error(
      "Missing Meta app credentials: set FB_APP_ID + FB_APP_SECRET (preferred) or META_APP_ID + META_APP_SECRET (fallback)."
    );
  }
}

validateEnv();
