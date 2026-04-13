import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { checkSubscription } from "@/lib/checkSubscription";
import { decrypt } from "@/lib/crypto";

/**
 * GET /api/fb/adaccounts — Returns the ad accounts owned by the
 * specified (or default) Meta Business Manager. Requires a valid metaAccessToken.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const dealerId = await getEffectiveDealerId();
  if (!dealerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const isSubscribed = await checkSubscription(dealerId);
  if (!isSubscribed) {
    return NextResponse.json({ error: "subscription_required" }, { status: 402 });
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: { metaAccessToken: true, metaBusinessId: true },
  });

  const encryptedToken = dealer?.metaAccessToken;
  if (!encryptedToken) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 400 });
  }

  const accessToken = decrypt(encryptedToken);
  const businessId =
    request.nextUrl.searchParams.get("businessId") ??
    request.nextUrl.searchParams.get("state") ??
    dealer.metaBusinessId;

  if (!businessId) {
    return NextResponse.json({ error: "missing_business_id" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${encodeURIComponent(
        businessId
      )}/owned_ad_accounts?fields=id,name,account_status&access_token=${encodeURIComponent(
        accessToken
      )}`
    );
    if (!res.ok) {
      console.error({
        event: "fb_adaccounts_fetch_failed",
        status: res.status,
      });
      return NextResponse.json(
        { error: "meta_api_error" },
        { status: 502 }
      );
    }
    const data = (await res.json()) as {
      data?: Array<{ id?: string; name?: string; account_status?: number }>;
    };
    const adAccounts = (data.data ?? [])
      .filter(
        (a): a is { id: string; name: string; account_status: number } =>
          typeof a.id === "string" &&
          typeof a.name === "string" &&
          typeof a.account_status === "number"
      )
      .map((a) => ({ id: a.id, name: a.name, account_status: a.account_status }));

    return NextResponse.json({ adAccounts });
  } catch (err) {
    console.error({
      event: "fb_adaccounts_error",
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
  }
}
