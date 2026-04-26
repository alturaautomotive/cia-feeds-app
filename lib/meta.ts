import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { checkSubscription } from "@/lib/checkSubscription";
import { decrypt } from "@/lib/crypto";
import { prisma } from "@/lib/prisma";

export const GRAPH_VERSION = "v19.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/**
 * Shared auth guard: validates session, dealer, and subscription.
 */
export async function authGuard(): Promise<
  | { ok: true; dealerId: string }
  | { ok: false; response: NextResponse }
> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  const dealerId = await getEffectiveDealerId();
  if (!dealerId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  const isSubscribed = await checkSubscription(dealerId);
  if (!isSubscribed) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "subscription_required" },
        { status: 402 }
      ),
    };
  }
  return { ok: true, dealerId };
}

/**
 * Load and decrypt a dealer's Meta access token.
 */
export async function loadDealerToken(dealerId: string): Promise<string | null> {
  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { metaAccessToken: true },
  });
  if (!dealer?.metaAccessToken) return null;
  return decryptToken(dealer.metaAccessToken);
}

/**
 * Decrypt an encrypted Meta access token.
 */
export function decryptToken(encryptedToken: string): string {
  return decrypt(encryptedToken);
}

/**
 * Exchange a short-lived token for a long-lived one.
 * Also used to refresh an existing long-lived token (same endpoint).
 */
export async function exchangeShortToLongLived(
  shortToken: string
): Promise<{ token: string; expiresAt: Date }> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env.FB_APP_ID!,
    client_secret: process.env.FB_APP_SECRET!,
    fb_exchange_token: shortToken,
  });
  const res = await fetch(
    `${GRAPH_BASE}/oauth/access_token?${params.toString()}`
  );
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    throw new Error("No access_token in exchange response");
  }
  const expiresIn = data.expires_in ?? 5184000; // default 60 days
  const expiresAt = new Date(Date.now() + expiresIn * 1000);
  return { token: data.access_token, expiresAt };
}

/**
 * Refresh an existing long-lived token.
 */
export async function refreshToken(
  token: string
): Promise<{ token: string; expiresAt: Date }> {
  return exchangeShortToLongLived(token);
}

/**
 * Make an authenticated request to the Meta Graph API.
 */
export async function graphFetch(
  endpoint: string,
  options: RequestInit = {},
  token: string
): Promise<Response> {
  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${GRAPH_BASE}${endpoint}${separator}access_token=${encodeURIComponent(token)}`;
  return fetch(url, options);
}
