import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import {
  GRAPH_VERSION,
  META_OAUTH_SCOPES,
  getMetaAppCredentials,
  buildCallbackUri,
} from "@/lib/meta";

/**
 * GET /api/fb/oauth — Redirects the dealer to Facebook's OAuth consent screen.
 * A random UUID state is persisted in the OAuthState table so the callback can
 * recover the dealerId without relying on cookies (which are lost on the
 * cross-site redirect from Facebook due to SameSite policy).
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

  let appId: string;
  let redirectUri: string;
  try {
    ({ appId } = getMetaAppCredentials());
    redirectUri = buildCallbackUri("fb");
  } catch {
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

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: META_OAUTH_SCOPES,
    state,
    response_type: "code",
  });

  const oauthUrl = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
  return NextResponse.redirect(oauthUrl);
}
