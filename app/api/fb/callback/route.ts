import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveDealerId } from "@/lib/impersonation";

/**
 * GET /api/fb/callback — Handles the Facebook OAuth callback.
 * Exchanges the returned code for a short-lived access token, upgrades it to a
 * long-lived token, and persists it as metaAccessToken on the Dealer record.
 *
 * NOTE: This endpoint deliberately does NOT assign fbPageId. Page selection is
 * performed explicitly by the user via the Meta connect wizard (see
 * /api/fb/pages) so that multi-page dealers can choose the correct Page
 * deterministically rather than defaulting to the first Page returned by
 * /me/accounts.
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const errorRedirect = NextResponse.redirect(
    `${appUrl}/dashboard/profile?fb=error`
  );

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dealerId = await getEffectiveDealerId();
  if (!dealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return errorRedirect;
  }

  // CSRF: state must match the current effective dealer id
  if (state !== dealerId) {
    return errorRedirect;
  }

  const appId = process.env.FB_APP_ID;
  const appSecret = process.env.FB_APP_SECRET;
  if (!appId || !appSecret || !appUrl) {
    return errorRedirect;
  }

  const redirectUri = `${appUrl}/api/fb/callback`;

  try {
    // 1. Exchange code → short-lived access token
    const tokenParams = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });
    const tokenRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?${tokenParams.toString()}`
    );
    if (!tokenRes.ok) {
      console.error({
        event: "fb_token_exchange_failed",
        status: tokenRes.status,
      });
      return errorRedirect;
    }
    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
    };
    const shortLivedToken = tokenData.access_token;
    if (!shortLivedToken) {
      return errorRedirect;
    }

    // 1b. Exchange short-lived token → long-lived token
    const longLivedParams = new URLSearchParams({
      grant_type: "fb_exchange_token",
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedToken,
    });
    const longLivedRes = await fetch(
      `https://graph.facebook.com/v19.0/oauth/access_token?${longLivedParams.toString()}`
    );
    if (!longLivedRes.ok) {
      console.error({
        event: "fb_long_lived_token_exchange_failed",
        status: longLivedRes.status,
      });
      return errorRedirect;
    }
    const longLivedData = (await longLivedRes.json()) as {
      access_token?: string;
    };
    const accessToken = longLivedData.access_token ?? shortLivedToken;

    // 2. Persist the long-lived access token on the Dealer record. The user
    // will pick their Facebook Page explicitly in the wizard — we do NOT
    // auto-assign the first returned Page here.
    await prisma.dealer.update({
      where: { id: dealerId },
      data: {
        metaAccessToken: accessToken,
      },
    });

    return NextResponse.redirect(`${appUrl}/dashboard/profile?fb=connected`);
  } catch (err) {
    console.error({
      event: "fb_callback_error",
      message: err instanceof Error ? err.message : String(err),
    });
    return errorRedirect;
  }
}
