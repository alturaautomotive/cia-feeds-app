import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getEffectiveDealerId } from "@/lib/impersonation";

/**
 * GET /api/fb/oauth — Redirects the dealer to Facebook's OAuth consent screen.
 * State carries the dealerId so the callback can bind the returned Page to
 * the correct dealer (and validate CSRF against the current session).
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

  const redirectUri = `${appUrl}/api/fb/callback`;
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    scope: "pages_show_list,business_management,catalog_management",
    state: dealerId,
    response_type: "code",
  });

  const oauthUrl = `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
  return NextResponse.redirect(oauthUrl);
}
