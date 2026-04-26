import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/crypto";
import {
  GRAPH_BASE,
  exchangeShortToLongLived,
  getMetaAppCredentials,
  buildCallbackUri,
} from "@/lib/meta";

/**
 * GET /api/meta/callback — Handles the Facebook OAuth callback for the
 * /api/meta/* flow. Exchanges code for tokens and sets Phase 1 metadata
 * (metaConnectedAt, metaTokenType).
 */
export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const errorRedirect = NextResponse.redirect(
    `${appUrl}/dashboard/profile?meta=error`
  );

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    console.error({ event: "meta_callback_missing_params", code: !!code, state: !!state });
    return errorRedirect;
  }

  let appId: string;
  let appSecret: string;
  let redirectUri: string;
  try {
    ({ appId, appSecret } = getMetaAppCredentials());
    redirectUri = buildCallbackUri("meta");
  } catch {
    console.error({ event: "meta_callback_missing_env" });
    return errorRedirect;
  }

  if (!appUrl) {
    console.error({ event: "meta_callback_missing_env" });
    return errorRedirect;
  }

  // Look up the state from the DB
  const oauthState = await prisma.oAuthState.findUnique({ where: { state } });
  if (!oauthState || oauthState.expiresAt < new Date()) {
    console.error({ event: "meta_csrf_state_invalid", state });
    return errorRedirect;
  }

  const dealerId = oauthState.dealerId;

  // Delete the used state record
  await prisma.oAuthState.delete({ where: { state } });

  try {
    // 1. Exchange code -> short-lived access token
    const tokenParams = new URLSearchParams({
      client_id: appId,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    });
    const tokenRes = await fetch(
      `${GRAPH_BASE}/oauth/access_token?${tokenParams.toString()}`
    );
    if (!tokenRes.ok) {
      console.error({
        event: "meta_token_exchange_failed",
        status: tokenRes.status,
      });
      return errorRedirect;
    }
    const tokenData = (await tokenRes.json()) as {
      access_token?: string;
    };
    const shortLivedToken = tokenData.access_token;
    if (!shortLivedToken) {
      console.error({ event: "meta_callback_missing_short_lived_token", dealerId });
      return errorRedirect;
    }

    // 1b. Exchange short-lived token -> long-lived token
    const { token: longLivedToken, expiresAt } =
      await exchangeShortToLongLived(shortLivedToken);

    // 2. Persist the long-lived access token with Phase 1 metadata
    await prisma.dealer.update({
      where: { id: dealerId },
      data: {
        metaAccessToken: encrypt(longLivedToken),
        metaTokenExpiresAt: expiresAt,
        metaConnectedAt: new Date(),
        metaTokenType: "user_token",
      },
    });

    return NextResponse.redirect(`${appUrl}/dashboard/profile?meta=connected`);
  } catch (err) {
    console.error({
      event: "meta_callback_error",
      message: err instanceof Error ? err.message : String(err),
    });
    return errorRedirect;
  }
}
