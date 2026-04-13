import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";

/**
 * GET /api/fb/callback — Handles the Facebook OAuth callback.
 * Exchanges the returned code for a short-lived access token, upgrades it to a
 * long-lived token, and persists it as metaAccessToken on the Dealer record.
 *
 * The dealerId is recovered from the DB-backed OAuthState table (keyed by the
 * random UUID state param), which avoids any dependency on cookies that are
 * stripped by the cross-site redirect from Facebook.
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

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    console.error({ event: "fb_callback_missing_params", code: !!code, state: !!state });
    return errorRedirect;
  }

  const appId = process.env.FB_APP_ID;
  const appSecret = process.env.FB_APP_SECRET;
  if (!appId || !appSecret || !appUrl) {
    console.error({ event: "fb_callback_missing_env" });
    return errorRedirect;
  }

  // Look up the state from the DB instead of relying on cookies
  const oauthState = await prisma.oAuthState.findUnique({ where: { state } });
  if (!oauthState || oauthState.expiresAt < new Date()) {
    console.error({ event: "fb_csrf_state_invalid", state });
    return errorRedirect;
  }

  const dealerId = oauthState.dealerId;

  // Delete the used state record
  await prisma.oAuthState.delete({ where: { state } });

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
      console.error({ event: "fb_callback_missing_short_lived_token", dealerId });
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
        metaAccessToken: encrypt(accessToken),
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
