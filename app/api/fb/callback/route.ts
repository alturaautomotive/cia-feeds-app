import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveDealerId } from "@/lib/impersonation";

/**
 * GET /api/fb/callback — Handles the Facebook OAuth callback.
 * Exchanges the returned code for an access token, fetches the dealer's Pages,
 * and stores the first Page id on the Dealer record as fbPageId.
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
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return errorRedirect;
    }

    // 2. Fetch the user's Pages
    const pagesRes = await fetch(
      `https://graph.facebook.com/v19.0/me/accounts?access_token=${encodeURIComponent(
        accessToken
      )}`
    );
    if (!pagesRes.ok) {
      console.error({
        event: "fb_pages_fetch_failed",
        status: pagesRes.status,
      });
      return errorRedirect;
    }
    const pagesData = (await pagesRes.json()) as {
      data?: Array<{ id?: string; name?: string }>;
    };
    const firstPage = pagesData.data?.[0];
    if (!firstPage?.id) {
      return errorRedirect;
    }

    // 3. Persist the page id on the Dealer record.
    // fbPageId is added by the schema migration phase — cast to keep TS happy
    // in the interim window before that migration lands.
    await prisma.dealer.update({
      where: { id: dealerId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: { fbPageId: firstPage.id } as unknown as any,
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
