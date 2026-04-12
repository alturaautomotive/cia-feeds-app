import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveDealerId } from "@/lib/impersonation";
import { checkSubscription } from "@/lib/checkSubscription";
import { decrypt } from "@/lib/crypto";

/**
 * POST /api/fb/feed — Registers the dealer's CSV feed as a Data Feed on the
 * previously-selected Meta product catalog and stores the returned feed id.
 */
export async function POST() {
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
    return NextResponse.json(
      { error: "subscription_required" },
      { status: 402 }
    );
  }

  const dealer = await prisma.dealer.findUnique({
    where: { id: dealerId },
    select: {
      slug: true,
      metaAccessToken: true,
      metaCatalogId: true,
    },
  });

  if (!dealer) {
    return NextResponse.json({ error: "dealer_not_found" }, { status: 404 });
  }
  const accessToken = dealer.metaAccessToken ? decrypt(dealer.metaAccessToken) : null;
  const catalogId = dealer.metaCatalogId;
  if (!accessToken) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 400 });
  }
  if (!catalogId) {
    return NextResponse.json(
      { error: "catalog_not_selected" },
      { status: 400 }
    );
  }

  const feedUrl = `https://www.ciafeed.com/feeds/${dealer.slug}.csv`;

  try {
    const res = await fetch(
      `https://graph.facebook.com/v19.0/${encodeURIComponent(
        catalogId
      )}/product_feeds`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "CIA Feed",
          feed_type: "PRODUCTS",
          schedule: {
            interval: "HOURLY",
            url: feedUrl,
            hour: 0,
          },
          access_token: accessToken,
        }),
      }
    );
    const data = (await res.json()) as {
      id?: string;
      error?: { message?: string; code?: number };
    };

    if (!res.ok || !data.id) {
      console.error({
        event: "fb_feed_create_failed",
        status: res.status,
        message: data.error?.message,
      });
      return NextResponse.json(
        { error: "meta_api_error", detail: data.error?.message },
        { status: 502 }
      );
    }

    await prisma.dealer.update({
      where: { id: dealerId },
      data: {
        metaFeedId: data.id,
      },
    });

    return NextResponse.json({ feedId: data.id, feedUrl });
  } catch (err) {
    console.error({
      event: "fb_feed_create_error",
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "meta_api_error" }, { status: 502 });
  }
}
