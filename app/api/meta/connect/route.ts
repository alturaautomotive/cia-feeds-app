import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { GRAPH_VERSION } from "@/lib/meta";

/**
 * GET /api/meta/connect — Redirects the dealer to Facebook's OAuth consent screen.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dealerId = await getEffectiveDealerId();
  if (!dealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const appId = process.env.FB_APP_ID;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appId || !appUrl) {
    return NextResponse.json(
      { error: "facebook_not_configured" },
      { status: 500 }
    );
  }

  const state = crypto.randomUUID();

  await prisma.oAuthState.create({
    data: {
      state,
      dealerId,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  // Fire-and-forget cleanup of expired state records
  prisma.oAuthState.deleteMany({ where: { expiresAt: { lt: new Date() } } }).catch(() => {});

  const redirectUri = `${appUrl}/api/meta/callback`;
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: "pages_show_list,business_management,catalog_management,ads_management",
    state,
    response_type: "code",
  });

  const oauthUrl = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
  return NextResponse.redirect(oauthUrl);
}
