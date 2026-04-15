import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { checkSubscription } from "@/lib/checkSubscription";
import { decrypt } from "@/lib/crypto";

/**
 * POST /api/fb/campaigns — Creates a Meta catalog-sales campaign and ad set.
 * Body: { name: string, adAccountId: string, catalogId: string }
 * Returns: { campaignId: string, adSetId: string }
 */
export async function POST(request: NextRequest) {
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
    select: { metaAccessToken: true },
  });

  const encryptedToken = dealer?.metaAccessToken;
  if (!encryptedToken) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 400 });
  }

  const accessToken = decrypt(encryptedToken);

  let body: { name?: string; adAccountId?: string; catalogId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { name, adAccountId, catalogId } = body;
  if (!name || !adAccountId || !catalogId) {
    return NextResponse.json(
      { error: "missing_fields", required: ["name", "adAccountId", "catalogId"] },
      { status: 400 }
    );
  }

  try {
    // Step 1 — Create Campaign
    const campaignRes = await fetch(
      `https://graph.facebook.com/v19.0/${encodeURIComponent(
        adAccountId
      )}/campaigns`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + accessToken },
        body: JSON.stringify({
          name,
          objective: "CATALOG_SALES",
          status: "PAUSED",
          special_ad_categories: [],
        }),
      }
    );

    if (!campaignRes.ok) {
      console.error({
        event: "fb_campaign_create_failed",
        status: campaignRes.status,
      });
      return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
    }

    const campaignData = (await campaignRes.json()) as { id?: string };
    const campaignId = campaignData.id;
    if (!campaignId) {
      console.error({ event: "fb_campaign_create_failed", detail: "no id returned" });
      return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
    }

    // Step 2 — Create Ad Set
    const adSetRes = await fetch(
      `https://graph.facebook.com/v19.0/${encodeURIComponent(
        adAccountId
      )}/adsets`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + accessToken },
        body: JSON.stringify({
          name,
          campaign_id: campaignId,
          promoted_object: {
            product_catalog_id: catalogId,
            product_set_id: "all",
          },
          billing_event: "IMPRESSIONS",
          daily_budget: 1000,
          status: "PAUSED",
          optimization_goal: "LINK_CLICKS",
        }),
      }
    );

    if (!adSetRes.ok) {
      console.error({
        event: "fb_adset_create_failed",
        status: adSetRes.status,
      });
      return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
    }

    const adSetData = (await adSetRes.json()) as { id?: string };
    const adSetId = adSetData.id;
    if (!adSetId) {
      console.error({ event: "fb_adset_create_failed", detail: "no id returned" });
      return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
    }

    return NextResponse.json({ campaignId, adSetId });
  } catch (err) {
    console.error({
      event: "fb_campaigns_error",
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
  }
}
